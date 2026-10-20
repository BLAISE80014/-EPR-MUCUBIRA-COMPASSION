const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const SavingsGroup = require('../models/SavingsGroup');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
const DEPARTMENT_NAMES = Object.freeze([
  { key: 'accounting', name: 'Accounting and Finance', role: 'accountant' },
  { key: 'health', name: 'Health Services', role: 'health_officer' },
  { key: 'communication', name: 'Communication', role: 'communication_officer' },
  { key: 'savings', name: 'Savings Groups', role: 'savings_group_manager' },
]);

router.use(requireAuth);

router.get(
  '/summary',
  requireRoles('director', 'accountant', 'health_officer', 'communication_officer', 'savings_group_manager'),
  async (req, res) => {
    const month = Number.parseInt(req.query.month, 10);
    const year = Number.parseInt(req.query.year, 10);
    const now = new Date();
    const periodMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getUTCMonth() + 1;
    const periodYear = Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : now.getUTCFullYear();
    const isDirector = req.user.role === 'director';
    const isAccountant = req.user.role === 'accountant';
    const isGroupManager = req.user.role === 'savings_group_manager';
    const staffFilter = isDirector
      ? { active: true, role: { $ne: 'director' } }
      : { active: true, department: req.user.department };
    const [staffCount, groupCount, roleCounts] = await Promise.all([
      User.countDocuments(staffFilter),
      isGroupManager
        ? SavingsGroup.countDocuments({ _id: { $in: req.user.groupIds }, active: true })
        : SavingsGroup.countDocuments({ active: true }),
      isDirector
        ? User.aggregate([
          { $match: { active: true, role: { $ne: 'director' } } },
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ])
        : Promise.resolve([]),
    ]);

    const countsByRole = new Map(roleCounts.map((entry) => [entry._id, entry.count]));
    return res.json({
      period: { month: periodMonth, year: periodYear },
      role: req.user.role,
      department: req.user.department,
      staffCount,
      activeGroupCount: groupCount,
      departments: isDirector
        ? DEPARTMENT_NAMES.map((department) => ({
          name: department.name,
          staffCount: countsByRole.get(department.role) || 0,
        }))
        : [],
      financialRecordsAvailable: false,
      monthlyReportsAvailable: false,
      assignedGroupCount: isGroupManager ? (req.user.groupIds || []).length : undefined,
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      financialAccess: isDirector || isAccountant,
    },
    );
  },
);

module.exports = router;
