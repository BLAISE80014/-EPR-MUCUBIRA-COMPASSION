const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SavingsGroup = require('../src/models/SavingsGroup');
const User = require('../src/models/User');

dotenv.config();

const ACCOUNTS = [
  { name: 'Development Director', email: 'director@eprmucubira.local', role: 'director', department: 'organization' },
  { name: 'Development Accountant', email: 'accountant@eprmucubira.local', role: 'accountant', department: 'accounting' },
  { name: 'Development Health Officer', email: 'health@eprmucubira.local', role: 'health_officer', department: 'health' },
  { name: 'Development Communication Officer', email: 'communication@eprmucubira.local', role: 'communication_officer', department: 'communication' },
  { name: 'Development Parent', email: 'parent@eprmucubira.local', role: 'parent', department: 'community' },
  { name: 'Development Community Member', email: 'member@eprmucubira.local', role: 'member', department: 'community' },
];
const DEMO_PASSWORDS = Object.freeze({
  'director@eprmucubira.local': 'Local-Director-Demo-2026!',
  'accountant@eprmucubira.local': 'Local-Accountant-Demo-2026!',
  'health@eprmucubira.local': 'Local-Health-Demo-2026!',
  'communication@eprmucubira.local': 'Local-Communication-Demo-2026!',
  'parent@eprmucubira.local': 'Local-Parent-Demo-2026!',
  'member@eprmucubira.local': 'Local-Member-Demo-2026!',
  'savings@eprmucubira.local': 'Local-Savings-Demo-2026!',
});

function localMongoUri(uri) {
  if (!uri) return false;
  try {
    const hostname = new URL(uri).hostname;
    return ['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return false;
  }
}

async function seedDevelopmentUsers() {
  const { MONGODB_URI } = process.env;
  if (process.env.NODE_ENV === 'production' || !localMongoUri(MONGODB_URI)) {
    throw new Error('Development accounts may only be seeded into a local MongoDB database outside production.');
  }

  await mongoose.connect(MONGODB_URI);
  const directorAccount = ACCOUNTS[0];
  const director = await User.findOneAndUpdate(
    { email: directorAccount.email },
    {
      $set: {
        ...directorAccount,
        passwordHash: await bcrypt.hash(DEMO_PASSWORDS[directorAccount.email], 12),
        groupIds: [],
        active: true,
        createdBy: null,
      },
    },
    { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  if (!director || director.role !== 'director') {
    throw new Error('A development Director account is required before creating the savings group manager.');
  }

  for (const account of ACCOUNTS.slice(1)) {
    await User.findOneAndUpdate(
      { email: account.email },
      {
        $set: {
          ...account,
          passwordHash: await bcrypt.hash(DEMO_PASSWORDS[account.email], 12),
          groupIds: [],
          active: true,
          createdBy: director._id,
        },
      },
      { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  let group = await SavingsGroup.findOne({ code: 'DEV-GROUP-01' });
  if (!group) {
    group = await SavingsGroup.create({
      name: 'Development Savings Group',
      code: 'DEV-GROUP-01',
      createdBy: director._id,
      active: true,
    });
  } else if (!group.active) {
    throw new Error('DEV-GROUP-01 already exists but is inactive; activate or rename it before seeding.');
  }

  const managerAccount = {
    name: 'Development Savings Group Manager',
    email: 'savings@eprmucubira.local',
    role: 'savings_group_manager',
    department: 'savings',
  };
  await User.findOneAndUpdate(
    { email: managerAccount.email },
    {
      $set: {
      ...managerAccount,
      passwordHash: await bcrypt.hash(DEMO_PASSWORDS[managerAccount.email], 12),
      groupIds: [group._id],
      active: true,
      createdBy: director._id,
      },
    },
    { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  console.log('\nLocal demo accounts have been created or reset to these credentials:\n');
  for (const account of [...ACCOUNTS, managerAccount]) {
    console.log(`${account.name}\n  Email: ${account.email}\n  Password: ${DEMO_PASSWORDS[account.email]}`);
  }
  console.log(`\nSavings group: ${group.name} (${group.code})`);
}

seedDevelopmentUsers()
  .catch((error) => {
    console.error('Unable to seed development accounts:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
