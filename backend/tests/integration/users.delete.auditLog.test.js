const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];
let mockAuditLogDB = [];
let mockAuditLogShouldFail = false;

// Helper to mimic simple MongoDB query matching (includes $ne for soft-delete)
function matchMongoQuery(user, query) {
  return Object.keys(query).every(key => {
    if (key === '$and') {
      return query.$and.every(subQuery => matchMongoQuery(user, subQuery));
    }
    if (key === '$or') {
      return query.$or.some(subQuery => matchMongoQuery(user, subQuery));
    }
    
    const queryValue = query[key];
    const userValue = user[key];

    if (queryValue && typeof queryValue === 'object' && queryValue.$regex !== undefined) {
      if (userValue === undefined || userValue === null) return false;
      const flags = queryValue.$options || '';
      const regex = new RegExp(queryValue.$regex, flags);
      return regex.test(String(userValue));
    }

    if (queryValue && typeof queryValue === 'object' && queryValue.$ne !== undefined) {
      return userValue !== queryValue.$ne;
    }

    if (typeof userValue === 'boolean') {
      const boolQuery = queryValue === 'true' || queryValue === true;
      return userValue === boolQuery;
    }

    if (!userValue || !queryValue) {
      return userValue === queryValue;
    }
    return userValue.toString() === queryValue.toString();
  });
}

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

mockUserModel.schema = {
  paths: {
    isDeleted: true
  }
};

mockUserModel.findOne = async function(query) {
  return mockUserDB.find(user => matchMongoQuery(user, query)) || null;
};

mockUserModel.countDocuments = async function(query) {
  return mockUserDB.filter(user => matchMongoQuery(user, query)).length;
};

mockUserModel.updateOne = async function(query, update) {
  const doc = mockUserDB.find(user => matchMongoQuery(user, query));
  if (doc) {
    if (update.$set) {
      Object.assign(doc, update.$set);
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }
  return { matchedCount: 0, modifiedCount: 0 };
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

describe('User Deletion Audit Logging Integration Tests', () => {
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
      isActive: true,
      isDeleted: false,
      deletedAt: null
    });
    
    userEngineerA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'engineer@a.com',
      role: 'devops_engineer',
      isActive: true,
      isDeleted: false,
      deletedAt: null
    });

    await userAdminA.save();
    await userEngineerA.save();

    // Generate JWT access token
    tokenAdminA = generateAccessToken({ userId: userAdminA._id, orgId: userAdminA.orgId, role: userAdminA.role });
  });

  test('should successfully delete user and create exactly one AuditLog entry', async () => {
    const response = await fetch(`${baseUrl}/users/${userEngineerA._id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tokenAdminA}`
      }
    });

    assert.strictEqual(response.status, 204);

    // Give fire-and-forget a tiny chance to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert audit log was created
    assert.strictEqual(mockAuditLogDB.length, 1, 'Exactly one audit log entry should be created');
    const log = mockAuditLogDB[0];
    assert.strictEqual(log.orgId.toString(), orgA._id.toString());
    assert.strictEqual(log.actorUserId.toString(), userAdminA._id.toString());
    assert.strictEqual(log.action, 'user.deleted');
    assert.strictEqual(log.targetType, 'User');
    assert.strictEqual(log.targetId.toString(), userEngineerA._id.toString());
    assert.deepStrictEqual(log.metadata, {});

    // Verify user is soft-deleted
    const user = mockUserDB.find(x => x._id.toString() === userEngineerA._id.toString());
    assert.strictEqual(user.isDeleted, true);
  });

  test('should block deletion of the last admin and produce zero audit entries', async () => {
    const response = await fetch(`${baseUrl}/users/${userAdminA._id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tokenAdminA}`
      }
    });

    assert.strictEqual(response.status, 400);

    // Give fire-and-forget a tiny chance to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    // Assert NO audit log was created
    assert.strictEqual(mockAuditLogDB.length, 0);

    // Verify user is NOT soft-deleted
    const user = mockUserDB.find(x => x._id.toString() === userAdminA._id.toString());
    assert.strictEqual(user.isDeleted, false);
  });

  test('should successfully delete user even if logAudit throws an error (failure isolation)', async () => {
    mockAuditLogShouldFail = true;

    // Suppress console.error output from fire-and-forget logAudit catch block
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const response = await fetch(`${baseUrl}/users/${userEngineerA._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${tokenAdminA}`
        }
      });

      assert.strictEqual(response.status, 204);

      // Verify user is soft-deleted
      const user = mockUserDB.find(x => x._id.toString() === userEngineerA._id.toString());
      assert.strictEqual(user.isDeleted, true);

      // Give fire-and-forget a tiny chance to run
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert NO audit log was persisted because of the failure, but the parent endpoint succeeded
      assert.strictEqual(mockAuditLogDB.length, 0);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
