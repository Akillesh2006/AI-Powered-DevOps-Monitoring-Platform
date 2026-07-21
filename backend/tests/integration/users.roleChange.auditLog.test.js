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

mockUserModel.countDocuments = async function(query) {
  return mockUserDB.filter(user => {
    return Object.keys(query).every(key => {
      if (key === 'isActive' && query.isActive === true) {
        return user.isActive === true;
      }
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  }).length;
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

describe('User Role Change Audit Logging Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let userAdminA;
  let userEngineerA;
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

    // Seed Users
    userAdminA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'admin@a.com',
      role: 'org_admin',
      isActive: true
    });
    
    userEngineerA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'engineer@a.com',
      role: 'devops_engineer',
      isActive: true
    });

    await userAdminA.save();
    await userEngineerA.save();

    // Generate JWT access token
    tokenAdminA = generateAccessToken({ userId: userAdminA._id, orgId: userAdminA.orgId, role: userAdminA.role });
  });

  test('should successfully update role and create exactly one AuditLog entry', async () => {
    const response = await fetch(`${baseUrl}/users/${userEngineerA._id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdminA}`
      },
      body: JSON.stringify({ role: 'team_lead' })
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.role, 'team_lead');

    // Give fire-and-forget a tiny chance to resolve (since logAudit is not awaited)
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert audit log was created
    assert.strictEqual(mockAuditLogDB.length, 1, 'Exactly one audit log entry should be created');
    const log = mockAuditLogDB[0];
    assert.strictEqual(log.orgId.toString(), orgA._id.toString());
    assert.strictEqual(log.actorUserId.toString(), userAdminA._id.toString());
    assert.strictEqual(log.action, 'user.role_changed');
    assert.strictEqual(log.targetType, 'User');
    assert.strictEqual(log.targetId.toString(), userEngineerA._id.toString());
    assert.deepStrictEqual(log.metadata, { fromRole: 'devops_engineer', toRole: 'team_lead' });
  });

  test('should successfully update role even if logAudit throws an error (failure isolation)', async () => {
    mockAuditLogShouldFail = true;

    // Suppress console.error output from fire-and-forget logAudit catch block
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const response = await fetch(`${baseUrl}/users/${userEngineerA._id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({ role: 'viewer' })
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.role, 'viewer');

      // Verify persistent in db
      const user = mockUserDB.find(x => x._id.toString() === userEngineerA._id.toString());
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
