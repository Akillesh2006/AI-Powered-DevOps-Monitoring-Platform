const crypto = require('crypto');
const RefreshToken = require('../models/RefreshToken');

/**
 * Hash a raw token string using SHA-256.
 * We use SHA-256 here since refresh tokens are already high-entropy random values,
 * unlike passwords which require bcrypt to prevent dictionary attacks.
 * 
 * @param {string} rawToken - The raw high-entropy refresh token string
 * @returns {string} Hex-encoded SHA-256 hash of the token
 */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issue a new refresh token for a user.
 * Generates a high-entropy random token, stores its SHA-256 hash, and returns raw token.
 * 
 * @param {string|ObjectId} userId - The user's database ID
 * @param {string|ObjectId|null} orgId - The user's organization ID
 * @param {string} [userAgent] - Optional HTTP user agent details
 * @returns {Promise<string>} The raw, unhashed refresh token
 */
async function issueRefreshToken(userId, orgId, userAgent = '') {
  if (!userId) {
    throw new Error('User ID is required to generate a refresh token');
  }

  // Generate 40 cryptographically secure random bytes (80 hex chars)
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawToken);

  // Set 7-day expiration time
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const tokenDoc = new RefreshToken({
    userId,
    orgId,
    tokenHash,
    expiresAt,
    userAgent,
    revoked: false
  });

  await tokenDoc.save();

  return rawToken;
}

/**
 * Rotate an existing refresh token.
 * Validates the raw token, revokes it, and issues a new one.
 * If the token is already revoked, triggers full session revocation (reuse detection).
 * 
 * @param {string} rawToken - The current raw refresh token
 * @returns {Promise<string>} The new raw refresh token
 */
async function rotateRefreshToken(rawToken) {
  if (!rawToken) {
    throw new Error('Token is required for rotation');
  }

  const tokenHash = hashToken(rawToken);
  const storedToken = await RefreshToken.findOne({ tokenHash });

  if (!storedToken) {
    throw new Error('Invalid refresh token');
  }

  // Check expiration
  if (storedToken.expiresAt < new Date()) {
    throw new Error('Expired refresh token');
  }

  // Reuse Detection: If the token is already revoked, revoke all tokens for this user!
  if (storedToken.revoked) {
    await revokeAllForUser(storedToken.userId);
    const error = new Error('Refresh token reuse detected');
    error.code = 'REUSE_DETECTED';
    error.userId = storedToken.userId;
    throw error;
  }

  // Mark the current token as revoked
  storedToken.revoked = true;
  await storedToken.save();

  // Issue a new token
  return issueRefreshToken(storedToken.userId, storedToken.orgId, storedToken.userAgent);
}

/**
 * Revoke all active refresh tokens for a user.
 * 
 * @param {string|ObjectId} userId - The user's database ID
 * @returns {Promise<Object>} Update operation metadata
 */
async function revokeAllForUser(userId) {
  if (!userId) {
    throw new Error('User ID is required to revoke tokens');
  }

  return RefreshToken.updateMany(
    { userId, revoked: false },
    { $set: { revoked: true } }
  );
}

module.exports = {
  issueRefreshToken,
  rotateRefreshToken,
  revokeAllForUser,
  hashToken
};
