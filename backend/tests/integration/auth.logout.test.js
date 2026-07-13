const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { generateAccessToken } = require('../../src/utils/jwt');

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
    mockTokenDB.push(this);
    return this;
  };
};
mockRefreshTokenModel.findOne = async function(query) {
  if (query.tokenHash) {
    return mockTokenDB.find(x => x.tokenHash === query.tokenHash) || null;
  }
  return null;
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

describe('POST /auth/logout Integration Tests', () => {
  let server;
  let baseUrl;
  let seedUser1;
  let seedUser2;
  let authHeader1;
  let authHeader2;

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

    // Seed two users
    seedUser1 = {
      _id: new mongoose.Types.ObjectId(),
      orgId: new mongoose.Types.ObjectId(),
      email: 'user1@acme.com',
      role: 'org_admin',
      isActive: true
    };
    seedUser2 = {
      _id: new mongoose.Types.ObjectId(),
      orgId: seedUser1.orgId,
      email: 'user2@acme.com',
      role: 'devops_engineer',
      isActive: true
    };
    mockUserDB.push(seedUser1, seedUser2);

    // Generate JWT access tokens
    const token1 = generateAccessToken({
      userId: seedUser1._id,
      orgId: seedUser1.orgId,
      role: seedUser1.role
    });
    const token2 = generateAccessToken({
      userId: seedUser2._id,
      orgId: seedUser2.orgId,
      role: seedUser2.role
    });

    authHeader1 = `Bearer ${token1}`;
    authHeader2 = `Bearer ${token2}`;
  });

  test('should successfully logout and revoke the presented refresh token', async () => {
    // Issue two refresh tokens for user1 (two sessions)
    const tokenA = await issueRefreshToken(seedUser1._id, seedUser1.orgId);
    const tokenB = await issueRefreshToken(seedUser1._id, seedUser1.orgId);

    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader1
      },
      body: JSON.stringify({ refreshToken: tokenA })
    });

    assert.strictEqual(response.status, 204);

    // Verify tokenA is revoked
    const hashA = crypto.createHash('sha256').update(tokenA).digest('hex');
    const docA = mockTokenDB.find(x => x.tokenHash === hashA);
    assert.strictEqual(docA.revoked, true);

    // Verify tokenB (other session) is still active/valid
    const hashB = crypto.createHash('sha256').update(tokenB).digest('hex');
    const docB = mockTokenDB.find(x => x.tokenHash === hashB);
    assert.strictEqual(docB.revoked, false);
  });

  test('should return 403 FORBIDDEN if a user attempts to logout a refresh token belonging to another user', async () => {
    // Issue token for user 1
    const tokenA = await issueRefreshToken(seedUser1._id, seedUser1.orgId);

    // User 2 attempts to revoke User 1's token
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader2
      },
      body: JSON.stringify({ refreshToken: tokenA })
    });

    assert.strictEqual(response.status, 403);
    const body = await response.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'FORBIDDEN');

    // Verify token is NOT revoked
    const hashA = crypto.createHash('sha256').update(tokenA).digest('hex');
    const docA = mockTokenDB.find(x => x.tokenHash === hashA);
    assert.strictEqual(docA.revoked, false);
  });

  test('should return 400 VALIDATION_ERROR on missing refresh token', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader1
      },
      body: JSON.stringify({})
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  });

  test('should return 401 UNAUTHORIZED if logout is hit without authorization', async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'some_token' })
    });

    assert.strictEqual(response.status, 401);
  });
});
