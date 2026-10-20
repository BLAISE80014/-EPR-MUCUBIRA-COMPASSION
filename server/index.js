const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { createApp } = require('./src/app');

dotenv.config();

function getRequiredEnvironment() {
  const required = ['MONGODB_URI', 'JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }

  return {
    mongoUri: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    port: Number(process.env.PORT) || 5000,
  };
}

async function start() {
  const config = getRequiredEnvironment();
  await mongoose.connect(config.mongoUri);
  const app = createApp(config);

  app.listen(config.port, () => {
    console.log(`EPR Mucubira Compassion API listening on port ${config.port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start the API:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { getRequiredEnvironment, start };
