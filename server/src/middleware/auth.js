const jwt = require('jsonwebtoken');
const User = require('../models/User');

const COOKIE_NAME = 'compassion_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const REMEMBERED_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getCookieValue(header, name) {
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return null;
}

function setSessionCookie(res, token, production, maxAge = SESSION_MAX_AGE_SECONDS) {
  const secure = production ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`,
  );
}

function clearSessionCookie(res, production) {
  const secure = production ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
  );
}

async function requireAuth(req, res, next) {
  const token = getCookieValue(req.headers.cookie, COOKIE_NAME);
  if (!token) {
    return res.status(401).json({ message: 'Please sign in to continue.' });
  }

  let claims;
  try {
    claims = jwt.verify(token, req.app.locals.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    clearSessionCookie(res, req.app.locals.production);
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }

  const user = await User.findById(claims.sub).select('_id name email role department groupIds active createdAt');
  if (!user || !user.active || user.role === 'pending') {
    clearSessionCookie(res, req.app.locals.production);
    return res.status(401).json({ message: 'This account is unavailable. Please contact an administrator.' });
  }

  req.user = user;
  return next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    department: user.department,
    groupIds: (user.groupIds || []).map((id) => id.toString()),
    active: user.active,
    createdAt: user.createdAt,
  };
}

module.exports = {
  COOKIE_NAME,
  REMEMBERED_SESSION_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  clearSessionCookie,
  getCookieValue,
  publicUser,
  requireAuth,
  requireRoles,
  setSessionCookie,
};
