const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { hashPassword, comparePassword } = require('../../src/utils/password');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];
let mockTokenDB = [];

// 2. Define mock Mongoose models
const mockOrganizationModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  Object.assign(this, data);
  this.save = async function() {
    const exists = mockOrgDB.find(x => x._id.toString() === this._id.toString());
    if (!exists) {
      mockOrgDB.push(this);
    } else {
      Object.assign(exists, this);
    }
    return this;
  };
};
mockOrganizationModel.findById = async function(id) {
  return mockOrgDB.find(x => x._id.toString() === id.toString()) || null;
};
mockOrganizationModel.findOne = async function(query) {
  return mockOrgDB.find(org => {
    return Object.keys(query).every(key => {
      if (!org[key] || !query[key]) return false;
      return org[key].toString() === query[key].toString();
    });
  }) || null;
};
mockOrganizationModel.find = function(query) {
  const matched = mockOrgDB.filter(org => {
    return Object.keys(query).every(key => {
      if (!org[key] || !query[key]) return false;
      return org[key].toString() === query[key].toString();
    });
  });
  const chainObj = {
    skip: function() { return this; },
    limit: function() { return this; },
    then: function(resolve) { resolve(matched); },
    catch: function(reject) { reject(new Error('Mock query error')); }
  };
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
};
mockOrganizationModel.countDocuments = async function() { return mockOrgDB.length; };

const mockUserModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  this.isActive = true; // Schema default value
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
mockUserModel.findById = async function(id) {
  return mockUserDB.find(x => x._id.toString() === id.toString()) || null;
};
mockUserModel.findOne = async function(query) {
  return mockUserDB.find(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  }) || null;
};
mockUserModel.find = function(query) {
  const matched = mockUserDB.filter(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  });

  const chainObj = {
    skip: function() { return this; },
    limit: function() { return this; },
    then: function(resolve) { resolve(matched); },
    catch: function(reject) { reject(new Error('Mock query error')); }
  };
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
};
mockUserModel.countDocuments = async function(query = {}) {
  return mockUserDB.filter(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  }).length;
};
mockUserModel.deleteOne = async function(query) {
  const index = mockUserDB.findIndex(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  });
  if (index !== -1) {
    mockUserDB.splice(index, 1);
    return { deletedCount: 1 };
  }
  return { deletedCount: 0 };
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

  return { nModified: matched.length };
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

describe('Phase 1 End-to-End Flow Verification', () => {
  let server;
  let baseUrl;

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

    // Clear rate limits
    const { ipStore } = require('../../src/middleware/rateLimiter');
    for (const key in ipStore) {
      delete ipStore[key];
    }
  });

  test('should execute full E2E auth & user flow successfully', async () => {
    const orgAdminEmail = 'ceo@acmecorp.com';
    const orgAdminPassword = 'Password123!';
    const devopsEmail = 'ops-engineer@acmecorp.com';
    const devopsPassword = 'SecurePass987!';

    // ----------------------------------------------------
    // Step 1: Register a new organization
    // ----------------------------------------------------
    const registerResponse = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationName: 'Acme Corporation E2E',
        adminEmail: orgAdminEmail,
        adminPassword: orgAdminPassword
      })
    });

    assert.strictEqual(registerResponse.status, 201);
    const registerBody = await registerResponse.json();
    assert.strictEqual(registerBody.success, true);
    assert.ok(registerBody.data.organization.id);
    assert.strictEqual(registerBody.data.user.email, orgAdminEmail);
    assert.strictEqual(registerBody.data.user.role, 'org_admin');
    assert.ok(registerBody.data.accessToken);
    assert.ok(registerBody.data.refreshToken);

    // ----------------------------------------------------
    // Step 2: Log in as the new org_admin
    // ----------------------------------------------------
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: orgAdminEmail,
        password: orgAdminPassword
      })
    });

    assert.strictEqual(loginResponse.status, 200);
    const loginBody = await loginResponse.json();
    assert.strictEqual(loginBody.success, true);
    assert.ok(loginBody.data.accessToken);
    assert.ok(loginBody.data.refreshToken);

    const adminAccessToken = loginBody.data.accessToken;
    const adminRefreshToken = loginBody.data.refreshToken;

    // ----------------------------------------------------
    // Step 3: Invite a devops_engineer user
    // ----------------------------------------------------
    const inviteResponse = await fetch(`${baseUrl}/users/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify({
        email: devopsEmail,
        role: 'devops_engineer'
      })
    });

    assert.strictEqual(inviteResponse.status, 201);
    const inviteBody = await inviteResponse.json();
    assert.strictEqual(inviteBody.success, true);
    assert.strictEqual(inviteBody.data.email, devopsEmail);
    assert.strictEqual(inviteBody.data.role, 'devops_engineer');

    // ----------------------------------------------------
    // Step 4: Log in as the invited user
    // Since invite generates a random token hash, we set a known password for the user in our mock DB
    // ----------------------------------------------------
    const invitedUserRecord = mockUserDB.find(u => u.email === devopsEmail);
    assert.ok(invitedUserRecord);
    invitedUserRecord.passwordHash = await hashPassword(devopsPassword);

    const devopsLoginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: devopsEmail,
        password: devopsPassword
      })
    });

    assert.strictEqual(devopsLoginResponse.status, 200);
    const devopsLoginBody = await devopsLoginResponse.json();
    assert.strictEqual(devopsLoginBody.success, true);
    assert.ok(devopsLoginBody.data.accessToken);

    const devopsAccessToken = devopsLoginBody.data.accessToken;

    // ----------------------------------------------------
    // Step 5: As the devops_engineer, attempt a super_admin-only action (GET /platform/organizations)
    // ----------------------------------------------------
    const restrictedResponse = await fetch(`${baseUrl}/platform/organizations`, {
      headers: { 'Authorization': `Bearer ${devopsAccessToken}` }
    });

    assert.strictEqual(restrictedResponse.status, 403);
    const restrictedBody = await restrictedResponse.json();
    assert.strictEqual(restrictedBody.success, false);
    assert.strictEqual(restrictedBody.error.code, 'FORBIDDEN');

    // ----------------------------------------------------
    // Step 6: As the org_admin, refresh their session and confirm reuse protection
    // ----------------------------------------------------
    const refreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: adminRefreshToken })
    });

    assert.strictEqual(refreshResponse.status, 200);
    const refreshBody = await refreshResponse.json();
    assert.strictEqual(refreshBody.success, true);
    assert.ok(refreshBody.data.accessToken);
    assert.ok(refreshBody.data.refreshToken);

    const newAdminRefreshToken = refreshBody.data.refreshToken;

    // Attempting to reuse the rotated adminRefreshToken should return 401 and trigger revocation cascade
    const reuseResponse = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: adminRefreshToken })
    });

    assert.strictEqual(reuseResponse.status, 401);

    // Confirm that the cascade invalidated even the new refresh token
    const newReuseResponse = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: newAdminRefreshToken })
    });

    assert.strictEqual(newReuseResponse.status, 401);

    // ----------------------------------------------------
    // Step 7: Log out and confirm the logged-out session's refresh token no longer works
    // We will use the devops engineer's session for this check
    // ----------------------------------------------------
    const devopsRefreshToken = devopsLoginBody.data.refreshToken;

    const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${devopsAccessToken}`
      },
      body: JSON.stringify({ refreshToken: devopsRefreshToken })
    });

    assert.strictEqual(logoutResponse.status, 204);

    // Attempting to refresh using the logged-out refresh token must fail
    const postLogoutRefreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: devopsRefreshToken })
    });

    assert.strictEqual(postLogoutRefreshResponse.status, 401);
  });
});
