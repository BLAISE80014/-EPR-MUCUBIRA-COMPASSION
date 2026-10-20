const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/app');
const authRoutes = require('../src/routes/auth');
const User = require('../src/models/User');

const app = createApp({
  jwtSecret: 'local-test-secret-must-be-at-least-32-bytes',
  clientOrigin: 'http://localhost:5173',
});

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('health endpoint reports application and database state', async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'disconnected' });
});

test('protected session endpoint rejects unauthenticated requests', async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Please sign in to continue.' });
});

test('state-changing requests reject untrusted origins', async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example' },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { message: 'Request origin is not allowed.' });
});

test('local development accepts localhost and 127.0.0.1 frontend origins', async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Origin: 'http://127.0.0.1:5173' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
});

test('public registration validates required fields before database access', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'New User',
      email: 'new.user@example.org',
      password: 'LongEnoughPassword123!',
      passwordConfirmation: 'DifferentPassword123!',
      termsAccepted: true,
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Passwords do not match.' });
});

test('registration rejects passwords exceeding bcrypt input length', async () => {
  const password = 'a'.repeat(73);
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'New User',
      email: 'new.user@example.org',
      password,
      passwordConfirmation: password,
      termsAccepted: true,
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: 'Enter a password of up to 128 characters and no more than 72 UTF-8 bytes.',
  });
});

test('registration rejects an existing email', async () => {
  const originalFindOne = User.findOne;
  User.findOne = async () => ({ _id: 'existing-user' });

  try {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New User',
        email: 'existing@example.org',
        password: 'LongEnoughPassword123!',
        passwordConfirmation: 'LongEnoughPassword123!',
        termsAccepted: true,
      }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { message: 'An account with this email already exists.' });
  } finally {
    User.findOne = originalFindOne;
  }
});

test('public registrations always receive the restricted active parent role', () => {
  assert.deepEqual(authRoutes.publicParentRegistration({
    name: 'New User',
    email: 'new.user@example.org',
    phone: '',
    passwordHash: 'hashed-password',
    role: 'director',
    department: 'organization',
    active: true,
  }), {
    name: 'New User',
    email: 'new.user@example.org',
    phone: '',
    passwordHash: 'hashed-password',
    role: 'parent',
    department: 'community',
    groupIds: [],
    active: true,
    createdBy: null,
  });
});

test('registration accepts a user-chosen password, ignores submitted roles, and starts a parent session', async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let createdUser;
  User.findOne = async () => null;
  User.create = async (account) => {
    createdUser = account;
    return {
      ...account,
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  };

  try {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New User',
        email: 'new.user@example.org',
        password: 'x',
        passwordConfirmation: 'x',
        termsAccepted: true,
        role: 'director',
        department: 'organization',
        active: true,
        groupIds: ['507f1f77bcf86cd799439012'],
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(createdUser.role, 'parent');
    assert.equal(createdUser.department, 'community');
    assert.equal(createdUser.active, true);
    assert.deepEqual(createdUser.groupIds, []);
    assert.notEqual(createdUser.passwordHash, 'x');
    assert.equal(payload.user.role, 'parent');
    assert.equal(payload.user.active, true);
    assert.equal(Object.hasOwn(payload.user, 'passwordHash'), false);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test('community members cannot access the organization summary API', async () => {
  const originalFindById = User.findById;
  const member = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Community Member',
    email: 'member@example.org',
    role: 'member',
    department: 'community',
    groupIds: [],
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  User.findById = () => ({ select: async () => member });

  try {
    const token = jwt.sign(
      { sub: member._id.toString() },
      app.locals.jwtSecret,
      { algorithm: 'HS256', expiresIn: 60 },
    );
    const response = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Cookie: `compassion_session=${token}` },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: 'You do not have permission to perform this action.' });
  } finally {
    User.findById = originalFindById;
  }
});

test('parents cannot access the organization summary API', async () => {
  const originalFindById = User.findById;
  const parent = {
    _id: { toString: () => '507f1f77bcf86cd799439013' },
    name: 'Parent Account',
    email: 'parent@example.org',
    role: 'parent',
    department: 'community',
    groupIds: [],
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  User.findById = () => ({ select: async () => parent });

  try {
    const token = jwt.sign(
      { sub: parent._id.toString() },
      app.locals.jwtSecret,
      { algorithm: 'HS256', expiresIn: 60 },
    );
    const response = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Cookie: `compassion_session=${token}` },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: 'You do not have permission to perform this action.' });
  } finally {
    User.findById = originalFindById;
  }
});

test('login rejects an account type that does not match the stored role', async () => {
  const originalFindOne = User.findOne;
  const user = {
    _id: { toString: () => '507f1f77bcf86cd799439014' },
    name: 'Community Member',
    email: 'member@example.org',
    passwordHash: await bcrypt.hash('SecureAccountPassword123!', 4),
    role: 'member',
    department: 'community',
    groupIds: [],
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  User.findOne = () => ({ select: async () => user });

  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: 'SecureAccountPassword123!',
        accountType: 'director',
      }),
    });

    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(await response.json(), {
      message: 'The selected account type does not match this account. Choose the type assigned by the Director.',
    });
  } finally {
    User.findOne = originalFindOne;
  }
});

test('valid login honors Remember me and returns a safe member profile', async () => {
  const originalFindOne = User.findOne;
  const user = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Community Member',
    email: 'member@example.org',
    phone: '',
    passwordHash: await bcrypt.hash('SecureAccountPassword123!', 4),
    role: 'member',
    department: 'community',
    groupIds: [],
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  User.findOne = () => ({ select: async () => user });

  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: 'SecureAccountPassword123!',
        rememberMe: true,
        accountType: 'member',
      }),
    });
    const payload = await response.json();
    const cookie = response.headers.get('set-cookie');
    const token = decodeURIComponent(cookie.split(';')[0].split('=')[1]);

    assert.equal(response.status, 200);
    assert.equal(payload.user.role, 'member');
    assert.equal(Object.hasOwn(payload.user, 'passwordHash'), false);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Max-Age=2592000/);
    assert.equal(jwt.decode(token).exp - jwt.decode(token).iat, 60 * 60 * 24 * 30);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('login endpoint applies an IP-based rate limit', async () => {
  let response;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid', password: 'invalid' }),
    });
  }

  assert.equal(response.status, 429);
  assert.equal((await response.json()).message, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
});
