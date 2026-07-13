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
mockOrganizationModel.findById = async function(id) {
  return mockOrgDB.find(x => x._id.toString() === id.toString()) || null;
};
mockOrganizationModel.find = function() {
  const chainObj = {
    skip: function() { return this; },
    limit: function() { return this; },
    then: function(resolve) { resolve(mockOrgDB); },
    catch: function(reject) { reject(new Error('Mock query error')); }
  };
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
};
mockOrganizationModel.countDocuments = async function() { return mockOrgDB.length; };

const mockUserModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  Object.assign(this, data);
  this.save = async function() {
    mockUserDB.push(this);
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
mockUserModel.countDocuments = async function() {
  // Return high count so last-admin checks succeed
  return 10;
};
mockUserModel.deleteOne = async function() {
  return { deletedCount: 1 };
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

describe('Comprehensive Phase 1 RBAC Verification Suite', () => {
  let server;
  let baseUrl;

  let orgA;
  let roles = ['super_admin', 'org_admin', 'devops_engineer', 'team_lead', 'viewer'];
  let tokens = {};
  let users = {};
  let refreshTokens = {};

  let targetUserId;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(async () => {
    mockOrgDB = [];
    mockUserDB = [];
    mockTokenDB = [];

    // Seed Org
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a', isActive: true });
    await orgA.save();

    targetUserId = new mongoose.Types.ObjectId();
    const targetUser = new mockUserModel({
      _id: targetUserId,
      orgId: orgA._id,
      email: 'target@org-a.com',
      role: 'viewer',
      isActive: true
    });
    await targetUser.save();

    // Create user and token for each role
    for (const role of roles) {
      const orgId = role === 'super_admin' ? null : orgA._id;
      const user = new mockUserModel({
        _id: new mongoose.Types.ObjectId(),
        orgId,
        email: `${role}@org-a.com`,
        role,
        isActive: true,
        passwordHash: 'dummy_hash'
      });
      await user.save();
      users[role] = user;

      tokens[role] = generateAccessToken({
        userId: user._id,
        orgId,
        role
      });

      // Issue actual refresh tokens to seed DB for logout tests
      const rawRefreshToken = await issueRefreshToken(user._id, orgId);
      refreshTokens[role] = rawRefreshToken;
    }

    // Reset rate limiter stores to prevent rate limiting
    const { ipStore } = require('../../src/middleware/rateLimiter');
    for (const key in ipStore) {
      delete ipStore[key];
    }
  });

  // Gated Matrix Rules for assertions
  const endpoints = [
    {
      name: 'GET /organizations/me',
      path: '/organizations/me',
      method: 'GET',
      body: null,
      allowed: ['org_admin', 'devops_engineer', 'team_lead', 'viewer'],
      expectedSuccessStatus: 200
    },
    {
      name: 'PUT /organizations/me',
      path: '/organizations/me',
      method: 'PUT',
      body: { name: 'New Acme Name' },
      allowed: ['org_admin'],
      expectedSuccessStatus: 200
    },
    {
      name: 'GET /users',
      path: '/users',
      method: 'GET',
      body: null,
      allowed: ['org_admin', 'devops_engineer', 'team_lead'],
      expectedSuccessStatus: 200
    },
    {
      name: 'POST /users/invite',
      path: '/users/invite',
      method: 'POST',
      body: { email: 'invitee@org-a.com', role: 'viewer' },
      allowed: ['org_admin'],
      expectedSuccessStatus: 201
    },
    {
      name: 'PATCH /users/:id/role',
      path: () => `/users/${targetUserId}/role`,
      method: 'PATCH',
      body: { role: 'team_lead' },
      allowed: ['org_admin'],
      expectedSuccessStatus: 200
    },
    {
      name: 'DELETE /users/:id',
      path: () => `/users/${targetUserId}`,
      method: 'DELETE',
      body: null,
      allowed: ['org_admin'],
      expectedSuccessStatus: 204
    },
    {
      name: 'GET /users/me',
      path: '/users/me',
      method: 'GET',
      body: null,
      allowed: ['org_admin', 'devops_engineer', 'team_lead', 'viewer', 'super_admin'],
      expectedSuccessStatus: 200
    },
    {
      name: 'PATCH /users/me',
      path: '/users/me',
      method: 'PATCH',
      body: { name: 'Updated Name' },
      allowed: ['org_admin', 'devops_engineer', 'team_lead', 'viewer', 'super_admin'],
      expectedSuccessStatus: 200
    },
    {
      name: 'GET /platform/organizations',
      path: '/platform/organizations',
      method: 'GET',
      body: null,
      allowed: ['super_admin'],
      expectedSuccessStatus: 200
    },
    {
      name: 'POST /auth/logout',
      path: '/auth/logout',
      method: 'POST',
      body: (role) => ({ refreshToken: refreshTokens[role] }),
      allowed: ['org_admin', 'devops_engineer', 'team_lead', 'viewer', 'super_admin'],
      expectedSuccessStatus: 204
    }
  ];

  // Dynamically iterate over every Endpoint and Role combination
  endpoints.forEach((ep) => {
    describe(`RBAC Matrix: ${ep.name}`, () => {
      roles.forEach((role) => {
        const isAllowed = ep.allowed.includes(role);
        const testTitle = `${role} should be ${isAllowed ? 'ALLOWED' : 'DENIED (403)'}`;

        test(testTitle, async () => {
          const resolvedPath = typeof ep.path === 'function' ? ep.path() : ep.path;
          const url = `${baseUrl}${resolvedPath}`;
          const token = tokens[role];
          const payload = typeof ep.body === 'function' ? ep.body(role) : ep.body;

          const response = await fetch(url, {
            method: ep.method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: payload ? JSON.stringify(payload) : null
          });

          if (isAllowed) {
            assert.strictEqual(response.status, ep.expectedSuccessStatus, `Role "${role}" failed to access allowed endpoint "${ep.name}". Expected status ${ep.expectedSuccessStatus}, got ${response.status}`);
          } else {
            assert.strictEqual(response.status, 403, `Role "${role}" accessed restricted endpoint "${ep.name}". Expected status 403, got ${response.status}`);
            const body = await response.json();
            assert.strictEqual(body.success, false);
            assert.strictEqual(body.error.code, 'FORBIDDEN');
          }
        });
      });
    });
  });
});
