const User = require('../server/src/models/User');
const mongoose = User.base;
const { createApp } = require('../server/src/app');

let app;
let connectionPromise;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for the Vercel API.`);
  }
  return value;
}

function createApplication() {
  const clientOrigin = process.env.CLIENT_ORIGIN || 'https://compassion-mucubira-uln4.vercel.app';
  const clientOrigins = [
    clientOrigin,
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ].filter(Boolean);

  return createApp({
    jwtSecret: requiredEnvironment('JWT_SECRET'),
    clientOrigin,
    clientOrigins,
    accountingCurrency: process.env.ACCOUNTING_BASE_CURRENCY || 'RWF',
    smtp: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.MAIL_FROM,
    },
  });
}

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(requiredEnvironment('MONGODB_URI'), {
      serverSelectionTimeoutMS: 15000,
    }).then(() => {
      connectionPromise = null;
    }).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }
  await connectionPromise;
}

module.exports = async function handler(req, res) {
  try {
    if (!app) app = createApplication();
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Vercel API initialization failed:', error);
    if (!res.headersSent) {
      return res.status(503).json({
        message: 'The API could not connect. Check the Vercel database and JWT environment variables.',
      });
    }
    return undefined;
  }
};
