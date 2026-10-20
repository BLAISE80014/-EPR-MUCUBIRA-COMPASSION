const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

dotenv.config();

async function seedDirector() {
  const { MONGODB_URI, DIRECTOR_EMAIL, DIRECTOR_NAME, DIRECTOR_PASSWORD } = process.env;
  if (!MONGODB_URI || !DIRECTOR_EMAIL || !DIRECTOR_NAME || !DIRECTOR_PASSWORD) {
    throw new Error('Set MONGODB_URI, DIRECTOR_EMAIL, DIRECTOR_NAME, and DIRECTOR_PASSWORD before seeding.');
  }
  if (DIRECTOR_PASSWORD.length < 12 || DIRECTOR_PASSWORD.length > 128) {
    throw new Error('DIRECTOR_PASSWORD must be between 12 and 128 characters.');
  }

  await mongoose.connect(MONGODB_URI);
  const email = DIRECTOR_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log('A user with that email already exists; no changes were made.');
    return;
  }

  await User.create({
    name: DIRECTOR_NAME.trim(),
    email,
    passwordHash: await bcrypt.hash(DIRECTOR_PASSWORD, 12),
    role: 'director',
    department: 'organization',
    groupIds: [],
    active: true,
  });
  console.log('Director account created.');
}

seedDirector()
  .catch((error) => {
    console.error('Unable to create Director account:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
