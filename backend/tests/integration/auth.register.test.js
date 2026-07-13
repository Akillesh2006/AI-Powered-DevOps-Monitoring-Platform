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
mockOrganizationModel.deleteOne = async function(query) {
  mockOrgDB = mockOrgDB.filter(x => x._id.toString() !== query._id.toString());
  return { deletedCount: 1 };
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

// 3. Load app (which will use the overridden mongoose models and connection)
const app = require('../../src/app');

describe('POST /auth/register Integration Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    // Start Express app on a dynamic port
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
  });

  test('should successfully register a new organization and admin account', async () => {
    const payload = {
      organizationName: 'Acme Corp',
      adminEmail: 'admin@acme.com',
      adminPassword: 'StrongPassword123!'
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 201);
    const body = await response.json();

    assert.strictEqual(body.success, true);
    assert.ok(body.data.organization);
    assert.strictEqual(body.data.organization.name, 'Acme Corp');
    assert.strictEqual(body.data.organization.slug, 'acme-corp');
    
    assert.ok(body.data.user);
    assert.strictEqual(body.data.user.email, 'admin@acme.com');
    assert.strictEqual(body.data.user.role, 'org_admin');
    
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);

    // Verify DB states
    assert.strictEqual(mockOrgDB.length, 1);
    assert.strictEqual(mockUserDB.length, 1);
    assert.strictEqual(mockTokenDB.length, 1);
  });

  test('should return 409 DUPLICATE_RESOURCE if email is already registered', async () => {
    // Pre-seed user email
    mockUserDB.push({
      _id: new mongoose.Types.ObjectId(),
      email: 'admin@acme.com',
      role: 'org_admin'
    });

    const payload = {
      organizationName: 'Acme Corp',
      adminEmail: 'admin@acme.com',
      adminPassword: 'StrongPassword123!'
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 409);
    const body = await response.json();

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'DUPLICATE_RESOURCE');
    assert.ok(body.error.message.includes('already registered'));

    // Verify no new DB docs were added
    assert.strictEqual(mockOrgDB.length, 0);
    assert.strictEqual(mockUserDB.length, 1); // Only the pre-seeded one
  });

  test('should return 400 VALIDATION_ERROR on missing or short organizationName', async () => {
    const payload = {
      organizationName: 'A', // too short (min 2)
      adminEmail: 'admin@acme.com',
      adminPassword: 'StrongPassword123!'
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.length > 0);
  });

  test('should return 400 VALIDATION_ERROR on invalid email format', async () => {
    const payload = {
      organizationName: 'Acme Corp',
      adminEmail: 'invalid-email-format',
      adminPassword: 'StrongPassword123!'
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.length > 0);
  });

  test('should return 400 VALIDATION_ERROR on weak password (missing number)', async () => {
    const payload = {
      organizationName: 'Acme Corp',
      adminEmail: 'admin@acme.com',
      adminPassword: 'NoNumberPassword!' // missing number
    };

    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    assert.ok(body.error.details.length > 0);
  });
});
