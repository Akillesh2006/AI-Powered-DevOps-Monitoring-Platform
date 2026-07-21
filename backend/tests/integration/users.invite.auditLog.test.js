const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];
let mockAuditLogDB = [];
let mockAuditLogShouldFail = false;

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
  return mockUserDB.find(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  }) || null;
};

const mockAuditLogModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  Object.assign(this, data);
  this.save = async function() {
    if (mockAuditLogShouldFail) {
      throw new Error('Forced Mongoose AuditLog save error');
    }
    mockAuditLogDB.push(this);
    return this;
  };
};

// Override mongoose.model to resolve mock models
mongoose.model = function(name) {
  if (name === 'Organization') return mockOrganizationModel;
  if (name === 'User') return mockUserModel;
  if (name === 'AuditLog') return mockAuditLogModel;
  return class MockModel {};
};

// Mock mongoose.connect to bypass connection attempts
mongoose.connect = async () => mongoose;

// Load app
const app = require('../../src/app');

describe('User Invitation Audit Logging Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let userAdminA;
  let tokenAdminA;

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
    mockAuditLogDB = [];
    mockAuditLogShouldFail = false;

    // Seed Organization
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a' });
    await orgA.save();

    // Seed User
    userAdminA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'admin@a.com',
      role: 'org_admin',
      isActive: true
    });
    await userAdminA.save();

    // Generate JWT access token
    tokenAdminA = generateAccessToken({ userId: userAdminA._id, orgId: userAdminA.orgId, role: userAdminA.role });
  });

  test('should successfully invite user and create exactly one AuditLog entry', async () => {
    const response = await fetch(`${baseUrl}/users/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdminA}`
      },
      body: JSON.stringify({
        email: 'invited@a.com',
        role: 'devops_engineer'
      })
    });

    assert.strictEqual(response.status, 201);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.email, 'invited@a.com');
    assert.strictEqual(body.data.role, 'devops_engineer');
    assert.strictEqual(body.data.status, 'invited');

    const newUserId = body.data.id;
    assert.ok(newUserId);

    // Give fire-and-forget a tiny chance to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert audit log was created
    assert.strictEqual(mockAuditLogDB.length, 1, 'Exactly one audit log entry should be created');
    const log = mockAuditLogDB[0];
    assert.strictEqual(log.orgId.toString(), orgA._id.toString());
    assert.strictEqual(log.actorUserId.toString(), userAdminA._id.toString());
    assert.strictEqual(log.action, 'user.invited');
    assert.strictEqual(log.targetType, 'User');
    assert.strictEqual(log.targetId.toString(), newUserId);
    assert.deepStrictEqual(log.metadata, { invitedRole: 'devops_engineer' });
  });

  test('should fail due to duplicate email and produce zero audit entries', async () => {
    // Attempt to invite already seeded userAdminA's email
    const response = await fetch(`${baseUrl}/users/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdminA}`
      },
      body: JSON.stringify({
        email: 'admin@a.com',
        role: 'devops_engineer'
      })
    });

    assert.strictEqual(response.status, 409);

    // Give fire-and-forget a tiny chance to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert NO audit log was created
    assert.strictEqual(mockAuditLogDB.length, 0);
  });

  test('should successfully invite user even if logAudit throws an error (failure isolation)', async () => {
    mockAuditLogShouldFail = true;

    // Suppress console.error output from fire-and-forget logAudit catch block
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const response = await fetch(`${baseUrl}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({
          email: 'invited-fail-logger@a.com',
          role: 'viewer'
        })
      });

      assert.strictEqual(response.status, 201);
      const body = await response.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.email, 'invited-fail-logger@a.com');

      // Verify persistent in db
      const user = mockUserDB.find(x => x.email === 'invited-fail-logger@a.com');
      assert.ok(user);
      assert.strictEqual(user.role, 'viewer');

      // Give fire-and-forget a tiny chance to run
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert NO audit log was persisted because of the failure, but the parent endpoint succeeded
      assert.strictEqual(mockAuditLogDB.length, 0);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
