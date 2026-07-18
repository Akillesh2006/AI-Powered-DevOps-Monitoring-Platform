const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];

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
  this.toObject = function() {
    const obj = { ...this };
    delete obj.save;
    delete obj.toObject;
    return obj;
  };
};

mockUserModel.findOne = function(query) {
  const matched = mockUserDB.find(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  }) || null;

  const chainObj = {
    select: function() { return this; },
    then: function(resolve) { resolve(matched); },
    catch: function(reject) { reject(new Error('Mock query error')); }
  };
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
};

mockUserModel.findById = async function(id) {
  return mockUserDB.find(x => x._id.toString() === id.toString()) || null;
};

// Override mongoose.model to resolve mock models
mongoose.model = function(name) {
  if (name === 'Organization') return mockOrganizationModel;
  if (name === 'User') return mockUserModel;
  return class MockModel {};
};

// Mock mongoose.connect to bypass connection attempts
mongoose.connect = async () => mongoose;

// 3. Load app
const app = require('../../src/app');

describe('User GET /users/:id Endpoint Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let orgB;

  let adminA;
  let engineerA;
  let viewerA;
  let adminB;

  let tokenAdminA;
  let tokenEngineerA;
  let tokenViewerA;
  let tokenAdminB;

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

    // Seed Organizations
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a' });
    orgB = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org B', slug: 'org-b' });
    await orgA.save();
    await orgB.save();

    // Seed Users
    adminA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'admin@a.com',
      role: 'org_admin',
      isActive: true,
      passwordHash: 'secret_hash_admin_a'
    });
    engineerA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'engineer@a.com',
      role: 'devops_engineer',
      isActive: true,
      passwordHash: 'secret_hash_engineer_a'
    });
    viewerA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'viewer@a.com',
      role: 'viewer',
      isActive: true,
      passwordHash: 'secret_hash_viewer_a'
    });
    adminB = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgB._id,
      email: 'admin@b.com',
      role: 'org_admin',
      isActive: true,
      passwordHash: 'secret_hash_admin_b'
    });

    await adminA.save();
    await engineerA.save();
    await viewerA.save();
    await adminB.save();

    // Generate JWT access tokens
    tokenAdminA = generateAccessToken({ userId: adminA._id, orgId: adminA.orgId, role: adminA.role });
    tokenEngineerA = generateAccessToken({ userId: engineerA._id, orgId: engineerA.orgId, role: engineerA.role });
    tokenViewerA = generateAccessToken({ userId: viewerA._id, orgId: viewerA.orgId, role: viewerA.role });
    tokenAdminB = generateAccessToken({ userId: adminB._id, orgId: adminB.orgId, role: adminB.role });
  });

  test('GET /users/:id - should return 200 with the correct user for an authorized same-org request', async () => {
    const response = await fetch(`${baseUrl}/users/${engineerA._id}`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.id, engineerA._id.toString());
    assert.strictEqual(body.data.email, engineerA.email);
    assert.strictEqual(body.data.role, engineerA.role);
    assert.strictEqual(body.data.passwordHash, undefined, 'passwordHash must be excluded');
  });

  test('GET /users/:id - should return 404 for a different-org id (tenant isolation)', async () => {
    // adminB belongs to orgB. engineerA belongs to orgA. adminB requests engineerA.
    const response = await fetch(`${baseUrl}/users/${engineerA._id}`, {
      headers: { 'Authorization': `Bearer ${tokenAdminB}` }
    });

    assert.strictEqual(response.status, 404);
    const body = await response.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'USER_NOT_FOUND');
  });

  test('GET /users/:id - should return 403 for a role lacking users:list permission (e.g. viewer)', async () => {
    const response = await fetch(`${baseUrl}/users/${engineerA._id}`, {
      headers: { 'Authorization': `Bearer ${tokenViewerA}` }
    });

    assert.strictEqual(response.status, 403);
  });

  test('GET /users/:id - should return 404 with USER_NOT_FOUND code for malformed ObjectId format', async () => {
    const response = await fetch(`${baseUrl}/users/not-a-valid-id`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 404);
    const body = await response.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'USER_NOT_FOUND');
    assert.strictEqual(body.error.message, 'User not found in organization');
  });

  test('GET /users/me - should resolve correctly to self profile and not be shadowed by /:id route', async () => {
    const response = await fetch(`${baseUrl}/users/me`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.id, adminA._id.toString());
    assert.strictEqual(body.data.email, adminA.email);
    assert.strictEqual(body.data.role, adminA.role);
  });
});
