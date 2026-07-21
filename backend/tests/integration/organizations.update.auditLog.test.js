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

describe('Organization Update Audit Logging Integration Tests', () => {
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
    orgA = new mockOrganizationModel({
      _id: new mongoose.Types.ObjectId(),
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'free',
      notificationDefaults: { alertEmailRecipients: ['ops@acme.com'] }
    });
    await orgA.save();

    // Seed User
    userAdminA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'admin@acme.com',
      role: 'org_admin',
      isActive: true
    });
    await userAdminA.save();

    // Generate JWT access token
    tokenAdminA = generateAccessToken({ userId: userAdminA._id, orgId: userAdminA.orgId, role: userAdminA.role });
  });

  test('should successfully update organization settings and create exactly one AuditLog entry', async () => {
    const response = await fetch(`${baseUrl}/organizations/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdminA}`
      },
      body: JSON.stringify({
        name: 'New Acme Corp',
        notificationDefaults: { alertEmailRecipients: ['alerts@acme.com'] }
      })
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.name, 'New Acme Corp');
    assert.strictEqual(body.data.slug, 'new-acme-corp');

    // Give fire-and-forget a tiny chance to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert audit log was created
    assert.strictEqual(mockAuditLogDB.length, 1, 'Exactly one audit log entry should be created');
    const log = mockAuditLogDB[0];
    assert.strictEqual(log.orgId.toString(), orgA._id.toString());
    assert.strictEqual(log.actorUserId.toString(), userAdminA._id.toString());
    assert.strictEqual(log.action, 'org.updated');
    assert.strictEqual(log.targetType, 'Organization');
    assert.strictEqual(log.targetId.toString(), orgA._id.toString());
    assert.deepStrictEqual(log.metadata.updatedFields, ['name', 'notificationDefaults']);
  });

  test('should fail validation and produce zero audit entries', async () => {
    // Send invalid payload (name too short, less than 2 characters)
    const response = await fetch(`${baseUrl}/organizations/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdminA}`
      },
      body: JSON.stringify({
        name: 'A',
        notificationDefaults: { alertEmailRecipients: ['alerts@acme.com'] }
      })
    });

    assert.strictEqual(response.status, 422);

    // Give fire-and-forget a tiny chance to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert NO audit log was created
    assert.strictEqual(mockAuditLogDB.length, 0);
  });

  test('should successfully update organization even if logAudit throws an error (failure isolation)', async () => {
    mockAuditLogShouldFail = true;

    // Suppress console.error output from fire-and-forget logAudit catch block
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const response = await fetch(`${baseUrl}/organizations/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({
          name: 'Super Acme Corp'
        })
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.name, 'Super Acme Corp');

      // Verify persistent in db
      const org = mockOrgDB.find(x => x._id.toString() === orgA._id.toString());
      assert.strictEqual(org.name, 'Super Acme Corp');

      // Give fire-and-forget a tiny chance to run
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert NO audit log was persisted because of the failure, but the parent endpoint succeeded
      assert.strictEqual(mockAuditLogDB.length, 0);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
