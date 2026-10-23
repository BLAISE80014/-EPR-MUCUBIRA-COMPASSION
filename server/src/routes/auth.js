const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const User = require('../models/User');
const { ROLE_DEPARTMENTS } = require('../constants/roles');
const { isValidRegistrationPassword } = require('../constants/passwordPolicy');
const {
  publicUser,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  SESSION_MAX_AGE_SECONDS,
  REMEMBERED_SESSION_MAX_AGE_SECONDS,
} = require('../middleware/auth');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()\d\s.-]{7,32}$/;
const LOGIN_ROLES = new Set([
  'director',
  'accountant',
  'health_officer',
  'communication_officer',
  'savings_group_manager',
  'member',
  'parent',
]);

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
});

const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many account requests. Please wait an hour and try again.' },
});
const PROFILE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROFILE_PHONE_PATTERN = /^[+()\d\s.-]{7,32}$/;

function publicParentRegistration({ name, email, phone, passwordHash }) {
  return {
    name,
    email,
    phone,
    passwordHash,
    role: 'parent',
    department: ROLE_DEPARTMENTS.parent,
    groupIds: [],
    active: true,
    createdBy: null,
  };
}

router.post('/register', registrationRateLimit, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const submittedPhone = req.body?.phone;
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const passwordConfirmation = typeof req.body?.passwordConfirmation === 'string'
    ? req.body.passwordConfirmation
    : '';

  if (name.length < 2 || name.length > 120) {
    return res.status(400).json({ message: 'Name must be between 2 and 120 characters.' });
  }
  if (/[\u0000-\u001F\u007F]/.test(name)) {
    return res.status(400).json({ message: 'Name contains unsupported characters.' });
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (submittedPhone !== undefined && typeof submittedPhone !== 'string') {
    return res.status(400).json({ message: 'Enter a valid phone number or leave the field blank.' });
  }
  if (phone && !PHONE_PATTERN.test(phone)) {
    return res.status(400).json({ message: 'Enter a valid phone number or leave the field blank.' });
  }
  if (!isValidRegistrationPassword(password)) {
    return res.status(400).json({ message: 'Enter a password of up to 128 characters and no more than 72 UTF-8 bytes.' });
  }
  if (password !== passwordConfirmation) {
    return res.status(400).json({ message: 'Passwords do not match.' });
  }
  if (req.body?.termsAccepted !== true) {
    return res.status(400).json({ message: 'Please confirm the account and access terms to continue.' });
  }

  if (await User.findOne({ email })) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const user = await User.create(publicParentRegistration({
    name,
    email,
    phone,
    passwordHash: await bcrypt.hash(password, 12),
  }));
  const token = jwt.sign(
    { sub: user._id.toString() },
    req.app.locals.jwtSecret,
    { algorithm: 'HS256', expiresIn: SESSION_MAX_AGE_SECONDS },
  );
  setSessionCookie(res, token, req.app.locals.production);

  return res.status(201).json({
    message: 'Your account has been created.',
    user: publicUser(user),
  });
});

router.post('/login', loginRateLimit, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const accountType = req.body?.accountType;

  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !password || password.length > 128) {
    return res.status(400).json({ message: 'Enter a valid email address and password.' });
  }
  if (accountType !== undefined && !LOGIN_ROLES.has(accountType)) {
    return res.status(400).json({ message: 'Choose a valid account type.' });
  }

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  if (user.role === 'pending') {
    return res.status(403).json({ message: 'Your account is awaiting Director approval.' });
  }
  if (!user.active) {
    return res.status(403).json({ message: 'This account is inactive. Contact the Director.' });
  }
  if (accountType && user.role !== accountType) {
    return res.status(403).json({ message: 'The selected account type does not match this account. Choose the type assigned by the Director.' });
  }

  const rememberMe = req.body?.rememberMe === true;
  const sessionMaxAge = rememberMe ? REMEMBERED_SESSION_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS;
  const token = jwt.sign(
    { sub: user._id.toString() },
    req.app.locals.jwtSecret,
    { algorithm: 'HS256', expiresIn: sessionMaxAge },
  );
  setSessionCookie(res, token, req.app.locals.production, sessionMaxAge);
  return res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res, req.app.locals.production);
  return res.json({ message: 'Signed out successfully.' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/profile', requireAuth, async (req, res) => {
  const { name, email, phone, currentPassword } = req.body || {};
  const updates = req.body || {};
  if (!Object.keys(updates).length || Object.keys(updates).some(
    (field) => !['name', 'email', 'phone', 'currentPassword'].includes(field),
  )) {
    return res.status(400).json({ message: 'The profile update contains unsupported fields.' });
  }

  const normalizedName = typeof name === 'string' ? name.trim() : undefined;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined;
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : undefined;

  if (name !== undefined && (
    typeof name !== 'string' || normalizedName.length < 2 || normalizedName.length > 120
    || /[\u0000-\u001F\u007F]/.test(normalizedName)
  )) {
    return res.status(400).json({ message: 'Name must be between 2 and 120 characters.' });
  }
  if (email !== undefined && (
    typeof email !== 'string' || !PROFILE_EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254
  )) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (phone !== undefined && (
    typeof phone !== 'string' || (normalizedPhone && !PROFILE_PHONE_PATTERN.test(normalizedPhone))
  )) {
    return res.status(400).json({ message: 'Enter a valid phone number or leave the field blank.' });
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) return res.status(404).json({ message: 'Account not found.' });
  if (normalizedEmail && normalizedEmail !== user.email) {
    if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ message: 'Enter your current password to change your email address.' });
    }
    user.email = normalizedEmail;
  }
  if (normalizedName !== undefined) user.name = normalizedName;
  if (normalizedPhone !== undefined) user.phone = normalizedPhone;

  await user.save();
  return res.json({ user: publicUser(user) });
});

router.patch('/password', requireAuth, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!currentPassword || !isValidRegistrationPassword(newPassword)) {
    return res.status(400).json({
      message: 'Enter your current password and a new password of up to 128 characters and no more than 72 UTF-8 bytes.',
    });
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) return res.status(404).json({ message: 'Account not found.' });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ message: 'Your current password is incorrect.' });
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return res.status(400).json({ message: 'Choose a new password different from your current password.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  return res.json({ message: 'Your password has been changed.' });
});

module.exports = router;
module.exports.publicParentRegistration = publicParentRegistration;
