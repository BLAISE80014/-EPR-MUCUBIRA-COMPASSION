const nodemailer = require('nodemailer');

function createPasswordResetEmailSender(config) {
  const { host, port, secure, user, password, from } = config || {};
  if (!host || !port || !from || Boolean(user) !== Boolean(password)) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    ...(user ? { auth: { user, pass: password } } : {}),
  });

  return async ({ email, resetUrl }) => transporter.sendMail({
    from,
    to: email,
    subject: 'Reset your EPR Mucubira Compassion password',
    text: `Use this secure link to reset your password. It expires in 30 minutes:\n\n${resetUrl}\n\nIf you did not request a password reset, you can ignore this email.`,
    html: `<p>Use this secure link to reset your password. It expires in 30 minutes:</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request a password reset, you can ignore this email.</p>`,
  });
}

module.exports = { createPasswordResetEmailSender };
