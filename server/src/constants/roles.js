const ROLE_DEPARTMENTS = Object.freeze({
  director: 'organization',
  accountant: 'accounting',
  health_officer: 'health',
  communication_officer: 'communication',
  savings_group_manager: 'savings',
  member: 'community',
  parent: 'community',
  pending: 'pending',
});

const DEPARTMENTS = Object.freeze([
  'organization',
  'accounting',
  'health',
  'communication',
  'savings',
  'community',
  'pending',
]);

const ROLE_LABELS = Object.freeze({
  director: 'Director',
  accountant: 'Accountant',
  health_officer: 'Health Manager',
  communication_officer: 'Communication Manager',
  savings_group_manager: 'Savings Group Manager',
  member: 'Community Member',
  parent: 'Parent',
  pending: 'Pending approval',
});

function isRole(value) {
  return Object.hasOwn(ROLE_DEPARTMENTS, value);
}

function departmentForRole(role) {
  return ROLE_DEPARTMENTS[role] || null;
}

module.exports = { DEPARTMENTS, ROLE_DEPARTMENTS, ROLE_LABELS, departmentForRole, isRole };
