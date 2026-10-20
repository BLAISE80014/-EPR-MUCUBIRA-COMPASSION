const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PASSWORD_BYTES = 72;

function isValidRegistrationPassword(password) {
  return typeof password === 'string'
    && password.length >= 1
    && password.length <= MAX_PASSWORD_LENGTH
    && Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES;
}

function isValidNewPassword(password) {
  return typeof password === 'string'
    && password.length >= MIN_PASSWORD_LENGTH
    && password.length <= MAX_PASSWORD_LENGTH
    && Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES;
}

module.exports = {
  MAX_PASSWORD_BYTES,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidRegistrationPassword,
  isValidNewPassword,
};
