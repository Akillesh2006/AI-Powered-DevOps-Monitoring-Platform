const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;
const MAX_PASSWORD_LENGTH = 128;

/**
 * Hash a plain text password using bcrypt with cost factor 12.
 * Includes a maximum password length validation to prevent bcrypt DoS.
 * 
 * @param {string} plainPassword - The plain text password to hash.
 * @returns {Promise<string>} The bcrypt hashed password.
 */
async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  if (plainPassword.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters`);
  }
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Compare a plain text password with a bcrypt hash.
 * 
 * @param {string} plainPassword - The plain text password to check.
 * @param {string} hashedPassword - The hashed password to compare against.
 * @returns {Promise<boolean>} True if the password matches, false otherwise.
 */
async function comparePassword(plainPassword, hashedPassword) {
  if (typeof plainPassword !== 'string' || typeof hashedPassword !== 'string') {
    return false;
  }
  if (plainPassword.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  return bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = {
  hashPassword,
  comparePassword
};
