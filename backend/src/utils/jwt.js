const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// Enforce that JWT_SECRET must be configured in production environments.
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}

// Fallback secret ONLY for development/test purposes.
const SECRET = JWT_SECRET || 'dev_secret_fallback_value_not_secure';
const DEFAULT_EXPIRY = '15m';

/**
 * Generates a signed JWT access token using the HS256 algorithm.
 * Contains claims: sub (userId), orgId, role, iat, and exp.
 * 
 * @param {Object} userParams - Object containing user context.
 * @param {string} userParams.userId - The ID of the user (maps to 'sub').
 * @param {string|null} userParams.orgId - The tenant ID (maps to 'orgId', can be null for super_admin).
 * @param {string} userParams.role - The RBAC role of the user.
 * @param {string|number} [expiresIn] - Optional custom expiry overriding the 15-minute default.
 * @returns {string} The signed access token.
 */
function generateAccessToken({ userId, orgId, role }, expiresIn = DEFAULT_EXPIRY) {
  if (!userId) {
    throw new Error('userId is required to generate an access token');
  }
  if (!role) {
    throw new Error('role is required to generate an access token');
  }

  const payload = {
    sub: userId.toString(),
    orgId: orgId ? orgId.toString() : null,
    role
  };

  return jwt.sign(payload, SECRET, {
    algorithm: 'HS256',
    expiresIn
  });
}

/**
 * Verifies and decodes a signed JWT access token.
 * 
 * @param {string} token - The access token to verify.
 * @returns {Object} The decoded payload claims (sub, orgId, role, iat, exp).
 * @throws {Error} If the token has expired, has been tampered with, or is invalid.
 */
function verifyAccessToken(token) {
  if (!token) {
    throw new Error('Token is required for verification');
  }

  return jwt.verify(token, SECRET, {
    algorithms: ['HS256']
  });
}

module.exports = {
  generateAccessToken,
  verifyAccessToken
};
