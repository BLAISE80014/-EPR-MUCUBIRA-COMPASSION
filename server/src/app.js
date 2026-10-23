const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const savingsGroupRoutes = require('./routes/savingsGroups');
const staffRoutes = require('./routes/staff');
const { createPasswordResetEmailSender } = require('./services/passwordResetEmail');

function createApp(config) {
  if (!config?.jwtSecret || Buffer.byteLength(config.jwtSecret, 'utf8') < 32) {
    throw new Error('A JWT secret of at least 32 bytes is required.');
  }

  const configuredOrigin = new URL(config.clientOrigin || 'http://localhost:5173');
  const clientOrigin = configuredOrigin.origin;
  const allowedOrigins = new Set([configuredOrigin.origin]);
  if (process.env.NODE_ENV !== 'production') {
    if (configuredOrigin.hostname === 'localhost') {
      configuredOrigin.hostname = '127.0.0.1';
      allowedOrigins.add(configuredOrigin.origin);
    } else if (configuredOrigin.hostname === '127.0.0.1') {
      configuredOrigin.hostname = 'localhost';
      allowedOrigins.add(configuredOrigin.origin);
    }
  }
  const app = express();

  app.locals.jwtSecret = config.jwtSecret;
  app.locals.production = process.env.NODE_ENV === 'production';
  app.locals.clientOrigin = clientOrigin;
  app.locals.sendPasswordResetEmail = config.sendPasswordResetEmail
    || createPasswordResetEmailSender(config.smtp);
  app.locals.passwordResetEmailConfigured = Boolean(app.locals.sendPasswordResetEmail);

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  }));
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && !allowedOrigins.has(origin)) {
        return res.status(403).json({ message: 'Request origin is not allowed.' });
      }
    }
    return next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/savings-groups', savingsGroupRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: 'Endpoint not found.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({
        message: 'Please check the submitted information.',
        errors: Object.values(error.errors).map((item) => item.message),
      });
    }

    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ message: 'A submitted identifier is invalid.' });
    }

    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({ message: field === 'email' ? 'An account with this email already exists.' : 'This value is already in use.' });
    }

    console.error('Unhandled API error:', error);
    return res.status(500).json({ message: 'The server could not complete the request.' });
  });

  return app;
}

module.exports = { createApp };
