const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { hashPassword } = require('../../src/utils/password');

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

const mockRefreshTokenModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  Object.assign(this, data);
  this.save = async function() {
    mockTokenDB.push(this);
    return this;
  };
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

describe('POST /auth/login Integration Tests', () => {
  let server;
  let baseUrl;
  let seedUser;
  const rawPassword = 'StrongPassword123!';

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

    // Reset rate limiter IP store to avoid rate-limiting test failures
    const { ipStore } = require('../../src/middleware/rateLimiter');
    for (const key in ipStore) {
      delete ipStore[key];
    }

    // Seed organization and user
    const mockOrgId = new mongoose.Types.ObjectId();
    const mockUserId = new mongoose.Types.ObjectId();
    const hashedPassword = await hashPassword(rawPassword);

    seedUser = {
      _id: mockUserId,
      orgId: mockOrgId,
      email: 'admin@acme.com',
      passwordHash: hashedPassword,
      role: 'org_admin',
      isActive: true
    };

    mockUserDB.push(seedUser);
  });

  test('should successfully log in with correct credentials', async () => {
    const payload = {
      email: 'admin@acme.com',
      password: rawPassword
    };

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();

    assert.strictEqual(body.success, true);
    assert.ok(body.data.user);
    assert.strictEqual(body.data.user.id, seedUser._id.toString());
    assert.strictEqual(body.data.user.email, seedUser.email);
    assert.strictEqual(body.data.user.role, seedUser.role);
    assert.strictEqual(body.data.user.orgId, seedUser.orgId.toString());

    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);

    // Verify token was stored in DB
    assert.strictEqual(mockTokenDB.length, 1);
    assert.strictEqual(mockTokenDB[0].userId.toString(), seedUser._id.toString());
  });

  test('should return 401 UNAUTHORIZED on wrong password with identical response layout to unknown email', async () => {
    // 1. Hit with existing email but wrong password
    const wrongPasswordPayload = {
      email: 'admin@acme.com',
      password: 'WrongPassword'
    };

    const resWrongPass = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrongPasswordPayload)
    });

    assert.strictEqual(resWrongPass.status, 401);
    const bodyWrongPass = await resWrongPass.json();

    // 2. Hit with nonexistent email
    const unknownEmailPayload = {
      email: 'nonexistent@acme.com',
      password: rawPassword
    };

    const resUnknownEmail = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unknownEmailPayload)
    });

    assert.strictEqual(resUnknownEmail.status, 401);
    const bodyUnknownEmail = await resUnknownEmail.json();

    // 3. Confirm response bodies are byte-for-byte identical (preventing user enumeration)
    assert.deepEqual(bodyWrongPass, bodyUnknownEmail);
    assert.deepEqual(bodyWrongPass, {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
        details: []
      }
    });
  });

  test('should return 400 VALIDATION_ERROR if email or password is missing', async () => {
    const payload = {
      email: 'admin@acme.com'
    };

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  });

  test('should return 403 FORBIDDEN if the account is deactivated', async () => {
    // Deactivate the user
    seedUser.isActive = false;

    const payload = {
      email: 'admin@acme.com',
      password: rawPassword
    };

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 403);
    const body = await response.json();

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'FORBIDDEN');
    assert.ok(body.error.message.includes('deactivated'));
  });
});
