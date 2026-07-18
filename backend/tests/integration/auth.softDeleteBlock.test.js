const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

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
    const exists = mockUserDB.find(x => x._id.toString() === this._id.toString());
    if (!exists) {
      mockUserDB.push(this);
    } else {
      Object.assign(exists, this);
    }
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
    const exists = mockTokenDB.find(x => x._id.toString() === this._id.toString());
    if (!exists) {
      mockTokenDB.push(this);
    } else {
      Object.assign(exists, this);
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
mockRefreshTokenModel.deleteOne = async function(query) {
  const initialLength = mockTokenDB.length;
  mockTokenDB = mockTokenDB.filter(token => {
    return !Object.keys(query).every(key => {
      if (!token[key] || !query[key]) return false;
      return token[key].toString() === query[key].toString();
    });
  });
  return { deletedCount: initialLength - mockTokenDB.length };
};
mockRefreshTokenModel.deleteMany = async function(query) {
  const initialLength = mockTokenDB.length;
  mockTokenDB = mockTokenDB.filter(token => {
    return !Object.keys(query).every(key => {
      if (!token[key] || !query[key]) return false;
      return token[key].toString() === query[key].toString();
    });
  });
  return { deletedCount: initialLength - mockTokenDB.length };
};
mockRefreshTokenModel.updateMany = async function(query, update) {
  const matched = mockTokenDB.filter(token => {
    return Object.keys(query).every(key => {
      if (token[key] === undefined || query[key] === undefined) return false;
      return token[key].toString() === query[key].toString();
    });
  });

  if (update.$set) {
    matched.forEach(token => {
      Object.assign(token, update.$set);
    });
  }
  return { matchedCount: matched.length, modifiedCount: matched.length };
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

// 3. Import password utils, refresh token service, and app AFTER overriding mongoose
const { hashPassword } = require('../../src/utils/password');
const { issueRefreshToken } = require('../../src/services/refreshTokenService');
const app = require('../../src/app');

describe('Auth Soft Delete Block Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let passwordPlain = 'Password123!';
  let passwordHash;

  let activeUser;
  let deletedUser;

  let activeUserToken;
  let deletedUserToken;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    passwordHash = await hashPassword(passwordPlain);
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(async () => {
    mockOrgDB = [];
    mockUserDB = [];
    mockTokenDB = [];

    // Seed Org
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a' });
    await orgA.save();

    // Active User
    activeUser = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'active@org.com',
      passwordHash,
      role: 'org_admin',
      isActive: true,
      isDeleted: false
    });
    await activeUser.save();

    // Deleted User
    deletedUser = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'deleted@org.com',
      passwordHash,
      role: 'devops_engineer',
      isActive: true,
      isDeleted: true
    });
    await deletedUser.save();

    // Issue tokens for both
    activeUserToken = await issueRefreshToken(activeUser._id, orgA._id);
    deletedUserToken = await issueRefreshToken(deletedUser._id, orgA._id);
  });

  test('POST /auth/login - should allow active user to login successfully', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: activeUser.email, password: passwordPlain })
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
  });

  test('POST /auth/login - should reject soft-deleted user with 403 Forbidden', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: deletedUser.email, password: passwordPlain })
    });

    assert.strictEqual(response.status, 403);
    const body = await response.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'FORBIDDEN');
    assert.strictEqual(body.error.message, 'Account no longer exists');
  });

  test('POST /auth/refresh - should allow rotating token for active user successfully', async () => {
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: activeUserToken })
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
  });

  test('POST /auth/refresh - should reject token refresh for soft-deleted user with 401 Unauthorized', async () => {
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: deletedUserToken })
    });

    assert.strictEqual(response.status, 401);
    const body = await response.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
    assert.strictEqual(body.error.message, 'User account is invalid or deactivated');
  });
});
