const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const crypto = require('crypto');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];
let mockTokenDB = [];

// 2. Define mock Mongoose models
const mockOrganizationModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  Object.assign(this, data);
  this.save = async function() {
    mockOrgDB.push(this);
    return this;
  };
};

const mockUserModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  Object.assign(this, data);
  this.save = async function() {
    mockUserDB.push(this);
    return this;
  };
};
mockUserModel.findOne = async function(query) {
  if (query.email) {
    return mockUserDB.find(x => x.email === query.email) || null;
  }
  return null;
};
mockUserModel.findById = async function(id) {
  return mockUserDB.find(x => x._id.toString() === id.toString()) || null;
};

const mockRefreshTokenModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  Object.assign(this, data);
  this.save = async function() {
    const exists = mockTokenDB.find(x => x.tokenHash === this.tokenHash);
    if (exists && exists !== this) {
      throw new Error('E11000 duplicate key error');
    }
    if (!mockTokenDB.includes(this)) {
      mockTokenDB.push(this);
    }
    return this;
  };
};
mockRefreshTokenModel.findOne = async function(query) {
  if (query.tokenHash) {
    return mockTokenDB.find(x => x.tokenHash === query.tokenHash) || null;
  }
  return null;
};
mockRefreshTokenModel.updateMany = async function(query, update) {
  let matchedCount = 0;
  mockTokenDB.forEach(item => {
    const matches = Object.keys(query).every(key => item[key].toString() === query[key].toString());
    if (matches) {
      matchedCount++;
      if (update.$set) {
        Object.assign(item, update.$set);
      }
    }
  });
  return { matchedCount };
};

// Override mongoose.model to resolve mock models
mongoose.model = function(name) {
  if (name === 'Organization') return mockOrganizationModel;
  if (name === 'User') return mockUserModel;
  if (name === 'RefreshToken') return mockRefreshTokenModel;
  return class MockModel {};
};

// Mock mongoose.connect to bypass connection attempts
mongoose.connect = async () => mongoose;

// 3. Load app
const app = require('../../src/app');
const { issueRefreshToken } = require('../../src/services/refreshTokenService');

describe('POST /auth/refresh Integration Tests', () => {
  let server;
  let baseUrl;
  let seedUser;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(() => {
    mockOrgDB = [];
    mockUserDB = [];
    mockTokenDB = [];

    // Seed User
    seedUser = {
      _id: new mongoose.Types.ObjectId(),
      orgId: new mongoose.Types.ObjectId(),
      email: 'admin@acme.com',
      role: 'org_admin',
      isActive: true
    };
    mockUserDB.push(seedUser);
  });

  test('should successfully rotate a refresh token and issue a new pair', async () => {
    // Issue a token first
    const rawToken = await issueRefreshToken(seedUser._id, seedUser.orgId);

    const payload = {
      refreshToken: rawToken
    };

    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();

    assert.strictEqual(body.success, true);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
    assert.notStrictEqual(body.data.refreshToken, rawToken);

    // Verify old token is marked revoked
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const oldTokenDoc = mockTokenDB.find(x => x.tokenHash === hash);
    assert.strictEqual(oldTokenDoc.revoked, true);

    // Verify new token is active in DB
    const newHash = crypto.createHash('sha256').update(body.data.refreshToken).digest('hex');
    const newTokenDoc = mockTokenDB.find(x => x.tokenHash === newHash);
    assert.ok(newTokenDoc);
    assert.strictEqual(newTokenDoc.revoked, false);
  });

  test('should trigger reuse detection, return 401, and revoke all sessions if old token is reused', async () => {
    const token1 = await issueRefreshToken(seedUser._id, seedUser.orgId);
    const token2 = await issueRefreshToken(seedUser._id, seedUser.orgId); // another active session

    // Rotate token1 successfully
    const response1 = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token1 })
    });
    assert.strictEqual(response1.status, 200);
    const body1 = await response1.json();
    const newRawToken = body1.data.refreshToken;

    // Attempt to rotate token1 AGAIN (reuse/compromise attempt)
    const response2 = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token1 })
    });

    assert.strictEqual(response2.status, 401);
    const body2 = await response2.json();
    assert.strictEqual(body2.success, false);
    assert.strictEqual(body2.error.code, 'UNAUTHORIZED');
    assert.ok(body2.error.message.includes('reuse'));

    // Verify that ALL of the user's tokens are now revoked (both token2 and the new token generated)
    const t2Hash = crypto.createHash('sha256').update(token2).digest('hex');
    const newHash = crypto.createHash('sha256').update(newRawToken).digest('hex');

    const t2Doc = mockTokenDB.find(x => x.tokenHash === t2Hash);
    const newDoc = mockTokenDB.find(x => x.tokenHash === newHash);

    assert.strictEqual(t2Doc.revoked, true, 'Second session token should have been revoked');
    assert.strictEqual(newDoc.revoked, true, 'Rotated session token should have been revoked');
  });

  test('should return 401 UNAUTHORIZED on missing or invalid token format', async () => {
    // 1. Missing token
    const resMissing = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(resMissing.status, 401);
    
    // 2. Nonexistent token
    const resInvalid = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'nonexistent_refresh_token_value' })
    });
    assert.strictEqual(resInvalid.status, 401);
  });
});
