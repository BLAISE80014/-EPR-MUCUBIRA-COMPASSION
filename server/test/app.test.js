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

test('authenticated profile updates validate fields and return the saved account details', async () => {
  const originalFindById = User.findById;
  const user = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Community Member',
    email: 'member@example.org',
    phone: '',
    passwordHash: await bcrypt.hash('CurrentPassword1', 4),
    role: 'member',
    department: 'community',
    groupIds: [],
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    save: async function save() {},
  };
  User.findById = () => ({
    select: async (fields) => fields === '+passwordHash'
      ? user
      : { ...user, passwordHash: undefined },
  });
  const token = jwt.sign({ sub: user._id.toString() }, app.locals.jwtSecret, { algorithm: 'HS256' });

  try {
    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `compassion_session=${token}`,
      },
      body: JSON.stringify({ name: 'Updated Member', phone: '+250 788 123 456' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.user.name, 'Updated Member');
    assert.equal(payload.user.phone, '+250 788 123 456');
    assert.equal(payload.user.email, 'member@example.org');
    assert.equal(Object.hasOwn(payload.user, 'passwordHash'), false);
    assert.equal(user.name, 'Updated Member');
  } finally {
    User.findById = originalFindById;
  }
});

test('changing account email requires the current password', async () => {
  const originalFindById = User.findById;
  const user = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Community Member',
    email: 'member@example.org',
    phone: '',
    passwordHash: await bcrypt.hash('CurrentPassword1', 4),
    role: 'member',
    department: 'community',
    groupIds: [],
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    save: async function save() {},
  };
  User.findById = () => ({
    select: async (fields) => fields === '+passwordHash' ? user : { ...user, passwordHash: undefined },
  });
  const token = jwt.sign({ sub: user._id.toString() }, app.locals.jwtSecret, { algorithm: 'HS256' });

  try {
    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `compassion_session=${token}`,
      },
      body: JSON.stringify({ email: 'updated@example.org' }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      message: 'Enter your current password to change your email address.',
    });
    assert.equal(user.email, 'member@example.org');
  } finally {
    User.findById = originalFindById;
  }
});

test('authenticated users change passwords only after proving the current password', async () => {
  const originalFindById = User.findById;
  const user = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Community Member',
    email: 'member@example.org',
    phone: '',
    passwordHash: await bcrypt.hash('CurrentPassword1', 4),
    role: 'member',
    department: 'community',
    groupIds: [],
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    save: async function save() {},
  };
  User.findById = () => ({
    select: async (fields) => fields === '+passwordHash' ? user : { ...user, passwordHash: undefined },
  });
  const token = jwt.sign({ sub: user._id.toString() }, app.locals.jwtSecret, { algorithm: 'HS256' });

  try {
    const deniedResponse = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `compassion_session=${token}`,
      },
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'NewPassword2' }),
    });
    assert.equal(deniedResponse.status, 401);
    assert.equal((await deniedResponse.json()).message, 'Your current password is incorrect.');

    const response = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `compassion_session=${token}`,
      },
      body: JSON.stringify({ currentPassword: 'CurrentPassword1', newPassword: 'NewPassword2' }),
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).message, 'Your password has been changed.');
    assert.equal(await bcrypt.compare('NewPassword2', user.passwordHash), true);
  } finally {
    User.findById = originalFindById;
  }
});

test('password reset emails use a hashed, expiring, single-use token', async () => {
  const originalFindOne = User.findOne;
  const originalSender = app.locals.sendPasswordResetEmail;
  const originalConfigured = app.locals.passwordResetEmailConfigured;
  const user = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    name: 'Community Member',
    email: 'member@example.org',
    passwordHash: await bcrypt.hash('CurrentPassword1', 4),
    save: async function save() {},
  };
  let email;
  User.findOne = (filter) => {
    if (filter.email) return Promise.resolve(user);
    return {
      select: async () => filter.passwordResetTokenHash === user.passwordResetTokenHash
        && user.passwordResetExpiresAt > new Date()
        ? user
        : null,
    };
  };
  app.locals.passwordResetEmailConfigured = true;
  app.locals.sendPasswordResetEmail = async (message) => { email = message; };

  try {
    const requestResponse = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    const rawToken = new URL(email.resetUrl).searchParams.get('token');

    assert.equal(requestResponse.status, 200);
    assert.equal((await requestResponse.json()).message, 'If an account exists with this email, password reset instructions will be sent shortly.');
    assert.equal(new URL(email.resetUrl).origin, 'http://localhost:5173');
    assert.ok(rawToken);
    assert.notEqual(user.passwordResetTokenHash, rawToken);
    assert.ok(user.passwordResetExpiresAt > new Date());

    const mismatchResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken, password: 'NewSecurePassword123!', passwordConfirmation: 'MismatchPassword123!' }),
    });
    assert.equal(mismatchResponse.status, 400);
    assert.equal((await mismatchResponse.json()).message, 'Passwords do not match.');

    user.passwordResetExpiresAt = new Date(Date.now() - 1);
    const expiredResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken,
        password: 'NewSecurePassword123!',
        passwordConfirmation: 'NewSecurePassword123!',
      }),
    });
    assert.equal(expiredResponse.status, 400);
    assert.equal((await expiredResponse.json()).message, 'This password reset link is invalid or has expired. Request a new link.');

    const renewedRequestResponse = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email }),
    });
    assert.equal(renewedRequestResponse.status, 200);
    const renewedToken = new URL(email.resetUrl).searchParams.get('token');

    const resetResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: renewedToken,
        password: 'NewSecurePassword123!',
        passwordConfirmation: 'NewSecurePassword123!',
      }),
    });

    assert.equal(resetResponse.status, 200);
    assert.equal((await resetResponse.json()).message, 'Your password has been reset. You can now sign in.');
    assert.equal(await bcrypt.compare('NewSecurePassword123!', user.passwordHash), true);
    assert.equal(user.passwordResetTokenHash, undefined);
    assert.equal(user.passwordResetExpiresAt, undefined);

    const replayResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken,
        password: 'AnotherSecurePassword123!',
        passwordConfirmation: 'AnotherSecurePassword123!',
      }),
    });
    assert.equal(replayResponse.status, 400);
    assert.equal((await replayResponse.json()).message, 'This password reset link is invalid or has expired. Request a new link.');
  } finally {
    User.findOne = originalFindOne;
    app.locals.sendPasswordResetEmail = originalSender;
    app.locals.passwordResetEmailConfigured = originalConfigured;
  }
});

test('password reset requests do not disclose whether an email address exists', async () => {
  const originalFindOne = User.findOne;
  const originalSender = app.locals.sendPasswordResetEmail;
  const originalConfigured = app.locals.passwordResetEmailConfigured;
  app.locals.passwordResetEmailConfigured = true;
  app.locals.sendPasswordResetEmail = async () => {};
  User.findOne = async () => null;

  try {
    const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.org' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      message: 'If an account exists with this email, password reset instructions will be sent shortly.',
    });
  } finally {
    User.findOne = originalFindOne;
    app.locals.sendPasswordResetEmail = originalSender;
    app.locals.passwordResetEmailConfigured = originalConfigured;
  }
});

test('password reset requests report unavailable when SMTP is not configured', async () => {
  const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'member@example.org' }),
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: 'Password reset is temporarily unavailable. Please contact your administrator.',
  });
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
