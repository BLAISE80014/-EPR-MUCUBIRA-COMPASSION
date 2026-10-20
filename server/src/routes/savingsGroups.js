const express = require('express');
const mongoose = require('mongoose');
const SavingsGroup = require('../models/SavingsGroup');
const User = require('../models/User');
const { publicUser, requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
const GROUP_CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;
const GROUP_ACCESS_ROLES = ['director', 'accountant', 'savings_group_manager'];

router.use(requireAuth, requireRoles(...GROUP_ACCESS_ROLES));

router.get('/', async (req, res) => {
  const filter = { active: true };
  if (req.user.role === 'savings_group_manager') {
    filter._id = { $in: req.user.groupIds };
  }

  const groups = await SavingsGroup.find(filter).sort({ name: 1 });
  const managers = await User.find({
    role: 'savings_group_manager',
    active: true,
    groupIds: { $in: groups.map((group) => group._id) },
  }).select('_id name email groupIds');
  const byGroup = new Map();
  for (const manager of managers) {
    for (const groupId of manager.groupIds) {
      const key = groupId.toString();
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(publicUser(manager));
    }
  }

  return res.json({
    groups: groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      code: group.code,
      active: group.active,
      createdAt: group.createdAt,
      managers: byGroup.get(group._id.toString()) || [],
    })),
  });
});

router.post('/', requireRoles('director'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  if (name.length < 2 || name.length > 120) {
    return res.status(400).json({ message: 'Group name must be between 2 and 120 characters.' });
  }
  if (!GROUP_CODE_PATTERN.test(code)) {
    return res.status(400).json({ message: 'Group ID must be 2-32 letters, numbers, hyphens, or underscores.' });
  }

  const group = await SavingsGroup.create({ name, code, createdBy: req.user._id });
  return res.status(201).json({
    group: {
      id: group._id.toString(),
      name: group.name,
      code: group.code,
      active: group.active,
      createdAt: group.createdAt,
      managers: [],
    },
  });
});

router.patch('/:id', requireRoles('director'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Savings group identifier is invalid.' });
  }

  const group = await SavingsGroup.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Savings group not found.' });
  const updates = req.body || {};
  if (!Object.keys(updates).length || Object.keys(updates).some((key) => !['name', 'code', 'active'].includes(key))) {
    return res.status(400).json({ message: 'The update contains unsupported fields.' });
  }
  if (Object.hasOwn(updates, 'name')) {
    if (typeof updates.name !== 'string' || updates.name.trim().length < 2 || updates.name.trim().length > 120) {
      return res.status(400).json({ message: 'Group name must be between 2 and 120 characters.' });
    }
    group.name = updates.name.trim();
  }
  if (Object.hasOwn(updates, 'code')) {
    const code = typeof updates.code === 'string' ? updates.code.trim().toUpperCase() : '';
    if (!GROUP_CODE_PATTERN.test(code)) {
      return res.status(400).json({ message: 'Group ID must be 2-32 letters, numbers, hyphens, or underscores.' });
    }
    group.code = code;
  }
  if (Object.hasOwn(updates, 'active')) {
    if (typeof updates.active !== 'boolean') {
      return res.status(400).json({ message: 'Group status must be active or inactive.' });
    }
    if (!updates.active) {
      await User.updateMany(
        { role: 'savings_group_manager', groupIds: group._id },
        { $pull: { groupIds: group._id } },
      );
    }
    group.active = updates.active;
  }

  await group.save();
  return res.json({
    group: {
      id: group._id.toString(),
      name: group.name,
      code: group.code,
      active: group.active,
      createdAt: group.createdAt,
      managers: [],
    },
  });
});

module.exports = router;
