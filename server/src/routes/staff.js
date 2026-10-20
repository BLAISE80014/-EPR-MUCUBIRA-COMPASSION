const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const SavingsGroup = require('../models/SavingsGroup');
const { ROLE_DEPARTMENTS, isRole } = require('../constants/roles');
const { isValidNewPassword } = require('../constants/passwordPolicy');
const { publicUser, requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MUTABLE_ROLES = Object.keys(ROLE_DEPARTMENTS).filter((role) => role !== 'director');

router.use(requireAuth, requireRoles('director'));

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validGroupIds(value) {
  return Array.isArray(value)
    && value.every((id) => typeof id === 'string' && mongoose.isValidObjectId(id))
    && new Set(value).size === value.length;
}

async function validateRoleAndGroups(role, groupIds) {
  if (!MUTABLE_ROLES.includes(role)) {
    return 'Select a valid staff role.';
  }
  if (!Array.isArray(groupIds) || !validGroupIds(groupIds)) {
    return 'Savings group assignments are invalid.';
  }
  if (role !== 'savings_group_manager' && groupIds.length > 0) {
    return 'Only Savings Group Managers can be assigned to savings groups.';
  }
  if (role === 'savings_group_manager' && groupIds.length === 0) {
    return 'Assign at least one savings group to a Savings Group Manager.';
  }
  if (groupIds.length) {
    const count = await SavingsGroup.countDocuments({ _id: { $in: groupIds }, active: true });
    if (count !== groupIds.length) {
      return 'One or more assigned savings groups are missing or inactive.';
    }
  }
  return null;
}

router.get('/', async (req, res) => {
  const { search = '', role = '', department = '', status = '', groupId = '' } = req.query;
  const filter = {};

  if (typeof search === 'string' && search.trim()) {
    const pattern = new RegExp(escapeRegex(search.trim().slice(0, 100)), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  if (role) {
    if (!MUTABLE_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Role filter is invalid.' });
    }
    filter.role = role;
  }
  if (department) {
    if (!Object.values(ROLE_DEPARTMENTS).includes(department) || department === 'organization') {
      return res.status(400).json({ message: 'Department filter is invalid.' });
    }
    filter.department = department;
  }
  if (status) {
    if (!['active', 'inactive', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Status filter is invalid.' });
    }
    if (status === 'pending') {
      filter.role = 'pending';
      filter.active = false;
    } else if (status === 'inactive') {
      filter.active = false;
      filter.role = filter.role ? filter.role : { $ne: 'pending' };
    } else {
      filter.active = true;
    }
  }
  if (groupId) {
    if (!mongoose.isValidObjectId(groupId)) {
      return res.status(400).json({ message: 'Savings group filter is invalid.' });
    }
    filter.groupIds = groupId;
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('_id name email phone role department groupIds active createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return res.json({ staff: users.map(publicUser), page, limit, total });
});

router.post('/', async (req, res) => {
  const { name, email, phone = '', password, role, groupIds = [] } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (normalizedName.length < 2 || normalizedName.length > 120) {
    return res.status(400).json({ message: 'Name must be between 2 and 120 characters.' });
  }
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (typeof phone !== 'string' || (phone.trim() && !/^[+()\d\s.-]{7,32}$/.test(phone.trim()))) {
    return res.status(400).json({ message: 'Enter a valid phone number or leave the field blank.' });
  }
  if (!isValidNewPassword(password)) {
    return res.status(400).json({ message: 'Temporary password must be 12-128 characters and no more than 72 UTF-8 bytes.' });
  }
  if (role === 'pending') {
    return res.status(400).json({ message: 'Choose an approved staff role for a Director-created account.' });
  }
  const roleError = await validateRoleAndGroups(role, groupIds);
  if (roleError) return res.status(400).json({ message: roleError });

  const user = await User.create({
    name: normalizedName,
    email: normalizedEmail,
    phone: phone.trim(),
    passwordHash: await bcrypt.hash(password, 12),
    role,
    department: ROLE_DEPARTMENTS[role],
    groupIds,
    createdBy: req.user._id,
    active: true,
  });

  return res.status(201).json({ staff: publicUser(user) });
});

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Staff identifier is invalid.' });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'Staff account not found.' });

  const updates = req.body || {};
  const allowedFields = new Set(['name', 'email', 'phone', 'role', 'groupIds', 'active', 'password']);
  if (!Object.keys(updates).length || Object.keys(updates).some((key) => !allowedFields.has(key))) {
    return res.status(400).json({ message: 'The update contains unsupported fields.' });
  }

  if (Object.hasOwn(updates, 'name')) {
    if (typeof updates.name !== 'string' || updates.name.trim().length < 2 || updates.name.trim().length > 120) {
      return res.status(400).json({ message: 'Name must be between 2 and 120 characters.' });
    }
    user.name = updates.name.trim();
  }
  if (Object.hasOwn(updates, 'email')) {
    if (typeof updates.email !== 'string' || !EMAIL_PATTERN.test(updates.email.trim()) || updates.email.trim().length > 254) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    user.email = updates.email.trim().toLowerCase();
  }
  if (Object.hasOwn(updates, 'phone')) {
    if (typeof updates.phone !== 'string' || (updates.phone.trim() && !/^[+()\d\s.-]{7,32}$/.test(updates.phone.trim()))) {
      return res.status(400).json({ message: 'Enter a valid phone number or leave the field blank.' });
    }
    user.phone = updates.phone.trim();
  }
  if (Object.hasOwn(updates, 'active')) {
    if (typeof updates.active !== 'boolean') {
      return res.status(400).json({ message: 'Account status must be active or inactive.' });
    }
    if (!updates.active && user._id.equals(req.user._id)) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }
    if (!updates.active && user.role === 'director') {
      const activeDirectors = await User.countDocuments({ role: 'director', active: true });
      if (activeDirectors <= 1) {
        return res.status(400).json({ message: 'The last active Director account cannot be deactivated.' });
      }
    }
    const nextRole = Object.hasOwn(updates, 'role') ? updates.role : user.role;
    if (updates.active && nextRole === 'pending') {
      return res.status(400).json({ message: 'Assign an approved staff role before activating this account.' });
    }
    user.active = updates.active;
  }
  if (Object.hasOwn(updates, 'password')) {
    if (!isValidNewPassword(updates.password)) {
      return res.status(400).json({ message: 'Temporary password must be 12-128 characters and no more than 72 UTF-8 bytes.' });
    }
    user.passwordHash = await bcrypt.hash(updates.password, 12);
  }
  if (Object.hasOwn(updates, 'role') || Object.hasOwn(updates, 'groupIds')) {
    const role = Object.hasOwn(updates, 'role') ? updates.role : user.role;
    const groupIds = Object.hasOwn(updates, 'groupIds')
      ? updates.groupIds
      : user.groupIds.map((id) => id.toString());
    const roleError = await validateRoleAndGroups(role, groupIds);
    if (roleError) return res.status(400).json({ message: roleError });
    user.role = role;
    user.department = ROLE_DEPARTMENTS[role];
    user.groupIds = groupIds;
    if (role === 'pending') user.active = false;
  }

  await user.save();
  return res.json({ staff: publicUser(user) });
});

module.exports = router;
