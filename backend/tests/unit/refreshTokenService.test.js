const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

// Mock data store
let mockDB = [];

// Define mock model
const mockRefreshTokenModel = function(data) {
  Object.assign(this, data);
  this.save = async function() {
    const exists = mockDB.find(item => item.tokenHash === this.tokenHash);
    if (exists && exists !== this) {
      throw new Error('E11000 duplicate key error');
    }
    if (!mockDB.includes(this)) {
      mockDB.push(this);
    }
    return this;
  };
};

mockRefreshTokenModel.findOne = async function(query) {
  const found = mockDB.find(item => {
    return Object.keys(query).every(key => item[key] === query[key]);
  });
  return found || null;
};

mockRefreshTokenModel.updateMany = async function(query, update) {
  let matchedCount = 0;
  mockDB.forEach(item => {
    const matches = Object.keys(query).every(key => item[key] === query[key]);
    if (matches) {
      matchedCount++;
      if (update.$set) {
        Object.assign(item, update.$set);
      }
    }
  });
  return { matchedCount };
};

// Mock mongoose.model to return our mocked class instead of real Mongoose models
mongoose.model = function(name, schema) {
  if (name === 'RefreshToken') {
    return mockRefreshTokenModel;
  }
  // Stub other models (User, etc.)
  return class MockModel {
    constructor(data) { Object.assign(this, data); }
    static findById = async () => null;
  };
};

// Now import the service and the original models, which will use our mocked mongoose.model
const {
  issueRefreshToken,
  rotateRefreshToken,
  revokeAllForUser
} = require('../../src/services/refreshTokenService');

describe('Refresh Token Service Tests (Mock Mongoose)', () => {
  const mockUserId = '64b0f0278783be3eb87a950a';
  const mockOrgId = '64b0f0278783be3eb87a950b';

  beforeEach(() => {
    mockDB = [];
  });

  test('should successfully issue a refresh token and store its SHA-256 hash', async () => {
    const rawToken = await issueRefreshToken(mockUserId, mockOrgId, 'Mozilla/5.0');
    assert.ok(rawToken);
    assert.strictEqual(typeof rawToken, 'string');
    assert.strictEqual(rawToken.length, 80); // 40 bytes = 80 hex chars

    // Compute expected hash to verify DB contents
    const crypto = require('crypto');
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const storedToken = await mockRefreshTokenModel.findOne({ tokenHash: expectedHash });
    assert.ok(storedToken);
    assert.strictEqual(storedToken.userId, mockUserId);
    assert.strictEqual(storedToken.orgId, mockOrgId);
    assert.strictEqual(storedToken.userAgent, 'Mozilla/5.0');
    assert.strictEqual(storedToken.revoked, false);
    assert.ok(storedToken.expiresAt > new Date());
  });

  test('should rotate refresh token successfully, revoke the old one, and issue a new one', async () => {
    const rawToken = await issueRefreshToken(mockUserId, mockOrgId, 'Mozilla/5.0');

    const newRawToken = await rotateRefreshToken(rawToken);
    assert.ok(newRawToken);
    assert.notStrictEqual(newRawToken, rawToken);

    // Verify old token is marked revoked
    const crypto = require('crypto');
    const oldHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const oldToken = await mockRefreshTokenModel.findOne({ tokenHash: oldHash });
    assert.strictEqual(oldToken.revoked, true);

    // Verify new token exists and is active
    const newHash = crypto.createHash('sha256').update(newRawToken).digest('hex');
    const newToken = await mockRefreshTokenModel.findOne({ tokenHash: newHash });
    assert.ok(newToken);
    assert.strictEqual(newToken.revoked, false);
    assert.strictEqual(newToken.userId, mockUserId);
    assert.strictEqual(newToken.orgId, mockOrgId);
  });

  test('should trigger reuse detection, revoke all tokens for that user, and fail if a revoked token is rotated', async () => {
    const token1 = await issueRefreshToken(mockUserId, mockOrgId, 'Mozilla/5.0');
    const token2 = await issueRefreshToken(mockUserId, mockOrgId, 'Mozilla/5.0');

    // Legit rotation of token1
    const newRawToken = await rotateRefreshToken(token1);
    assert.ok(newRawToken);

    // Try to rotate token1 AGAIN (reuse detection)
    await assert.rejects(
      rotateRefreshToken(token1),
      (err) => {
        return err.code === 'REUSE_DETECTED' && err.message.includes('reuse detected');
      }
    );

    // Verify that ALL tokens for this user are now revoked
    const crypto = require('crypto');
    const token2Hash = crypto.createHash('sha256').update(token2).digest('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');

    const t2Doc = await mockRefreshTokenModel.findOne({ tokenHash: token2Hash });
    const newTokenDoc = await mockRefreshTokenModel.findOne({ tokenHash: newTokenHash });

    assert.strictEqual(t2Doc.revoked, true, 'token2 should be revoked due to reuse detection');
    assert.strictEqual(newTokenDoc.revoked, true, 'new token should be revoked due to reuse detection');
  });

  test('should revoke all active tokens for a user via revokeAllForUser', async () => {
    const token1 = await issueRefreshToken(mockUserId, mockOrgId);
    const token2 = await issueRefreshToken(mockUserId, mockOrgId);

    await revokeAllForUser(mockUserId);

    const crypto = require('crypto');
    const hash1 = crypto.createHash('sha256').update(token1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(token2).digest('hex');

    const doc1 = await mockRefreshTokenModel.findOne({ tokenHash: hash1 });
    const doc2 = await mockRefreshTokenModel.findOne({ tokenHash: hash2 });

    assert.strictEqual(doc1.revoked, true);
    assert.strictEqual(doc2.revoked, true);
  });
});
