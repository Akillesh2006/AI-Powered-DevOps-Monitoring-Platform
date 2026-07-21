const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];
let mockAuditLogDB = [];

// Helper to mimic simple MongoDB query matching (includes $ne for soft-delete)
function matchMongoQuery(item, query) {
  return Object.keys(query).every(key => {
    if (key === '$and') {
      return query.$and.every(subQuery => matchMongoQuery(item, subQuery));
    }
    if (key === '$or') {
      return query.$or.some(subQuery => matchMongoQuery(item, subQuery));
    }
    
    const queryValue = query[key];
    const itemValue = item[key];

    if (queryValue && typeof queryValue === 'object' && queryValue.$regex !== undefined) {
      if (itemValue === undefined || itemValue === null) return false;
      const flags = queryValue.$options || '';
      const regex = new RegExp(queryValue.$regex, flags);
      return regex.test(String(itemValue));
    }

    if (queryValue && typeof queryValue === 'object' && queryValue.$ne !== undefined) {
      return itemValue !== queryValue.$ne;
    }

    if (typeof itemValue === 'boolean') {
      const boolQuery = queryValue === 'true' || queryValue === true;
      return itemValue === boolQuery;
    }

    if (!itemValue || !queryValue) {
      return itemValue === queryValue;
    }
    return itemValue.toString() === queryValue.toString();
  });
}

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
    mockAuditLogDB.push(this);
    return this;
  };
};

mockAuditLogModel.find = function(query) {
  let matched = mockAuditLogDB.filter(log => matchMongoQuery(log, query));
  
  const chainObj = {
    sort: function(s) {
      this._sort = s;
      if (s && s.createdAt === -1) {
        matched.sort((a, b) => b.createdAt - a.createdAt);
      }
      return this;
    },
    skip: function(s) { 
      this._skip = s;
      return this; 
    },
    limit: function(l) { 
      this._limit = l;
      return this; 
    },
    then: function(resolve) {
      let result = [...matched];
      if (this._skip !== undefined) {
        result = result.slice(this._skip);
      }
      if (this._limit !== undefined) {
        result = result.slice(0, this._limit);
      }
      resolve(result);
    }
  };
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
};

mockAuditLogModel.countDocuments = async function(query) {
  return mockAuditLogDB.filter(log => matchMongoQuery(log, query)).length;
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

describe('Audit Logs Endpoint Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let orgB;
  let userAdminA;
  let userEngineerA;
  let userViewerA;
  let userAdminB;

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
    mockAuditLogDB = [];

    // Seed Organizations
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a', plan: 'free' });
    orgB = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org B', slug: 'org-b', plan: 'pro' });
    await orgA.save();
    await orgB.save();

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
    userViewerA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'viewer@a.com',
      role: 'viewer',
      isActive: true,
      isDeleted: false,
      deletedAt: null
    });
    userAdminB = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgB._id,
      email: 'admin@b.com',
      role: 'org_admin',
      isActive: true,
      isDeleted: false,
      deletedAt: null
    });

    await userAdminA.save();
    await userEngineerA.save();
    await userViewerA.save();
    await userAdminB.save();

    // Generate JWT access tokens
    tokenAdminA = generateAccessToken({ userId: userAdminA._id, orgId: userAdminA.orgId, role: userAdminA.role });
    tokenEngineerA = generateAccessToken({ userId: userEngineerA._id, orgId: userEngineerA.orgId, role: userEngineerA.role });
    tokenViewerA = generateAccessToken({ userId: userViewerA._id, orgId: userViewerA.orgId, role: userViewerA.role });
    tokenAdminB = generateAccessToken({ userId: userAdminB._id, orgId: userAdminB.orgId, role: userAdminB.role });

    // Seed some mock audit logs
    for (let i = 1; i <= 5; i++) {
      mockAuditLogDB.push(new mockAuditLogModel({
        orgId: orgA._id,
        actorUserId: userAdminA._id,
        action: 'user.invited',
        targetType: 'User',
        targetId: new mongoose.Types.ObjectId(),
        metadata: { invitedRole: 'viewer' },
        createdAt: new Date(Date.now() - i * 1000)
      }));
    }

    mockAuditLogDB.push(new mockAuditLogModel({
      orgId: orgB._id,
      actorUserId: userAdminB._id,
      action: 'org.updated',
      targetType: 'Organization',
      targetId: orgB._id,
      metadata: { updatedFields: ['name'] },
      createdAt: new Date()
    }));
  });

  test('GET /audit-logs - should allow org_admin to read logs, scoped and sorted', async () => {
    const response = await fetch(`${baseUrl}/audit-logs`, {
      headers: {
        'Authorization': `Bearer ${tokenAdminA}`
      }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.length, 5);
    
    // Check newest first sorting
    assert.ok(new Date(body.data[0].createdAt) > new Date(body.data[1].createdAt));

    // Ensure tenant isolation
    const hasOrgBLog = body.data.some(log => log.orgId.toString() === orgB._id.toString());
    assert.strictEqual(hasOrgBLog, false);
  });

  test('GET /audit-logs - should deny access to viewer and devops_engineer (RBAC)', async () => {
    const resViewer = await fetch(`${baseUrl}/audit-logs`, {
      headers: { 'Authorization': `Bearer ${tokenViewerA}` }
    });
    assert.strictEqual(resViewer.status, 403);

    const resEngineer = await fetch(`${baseUrl}/audit-logs`, {
      headers: { 'Authorization': `Bearer ${tokenEngineerA}` }
    });
    assert.strictEqual(resEngineer.status, 403);
  });

  test('GET /audit-logs - should deny unauthenticated requests', async () => {
    const response = await fetch(`${baseUrl}/audit-logs`);
    assert.strictEqual(response.status, 401);
  });

  test('GET /audit-logs - should paginate correctly (?page=2&limit=2)', async () => {
    const response = await fetch(`${baseUrl}/audit-logs?page=2&limit=2`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.length, 2);
    assert.deepStrictEqual(body.meta, {
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3
    });
  });

  test('End-to-End Audit Logs Verification: all four wired endpoints produce logs correctly', async () => {
    // 1. Role Change
    const resRole = await fetch(`${baseUrl}/users/${userEngineerA._id}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdminA}`
      },
      body: JSON.stringify({ role: 'team_lead' })
    });
    assert.strictEqual(resRole.status, 200);

    // 2. Organization Update
    const resOrg = await fetch(`${baseUrl}/organizations/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdminA}`
      },
      body: JSON.stringify({ name: 'Brand New Org A' })
    });
    assert.strictEqual(resOrg.status, 200);

    // 3. User Invitation
    const resInvite = await fetch(`${baseUrl}/users/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenAdminA}`
      },
      body: JSON.stringify({ email: 'newmember@a.com', role: 'viewer' })
    });
    assert.strictEqual(resInvite.status, 201);
    const inviteBody = await resInvite.json();
    const invitedUserId = inviteBody.data.id;

    // 4. User Deletion
    const resDelete = await fetch(`${baseUrl}/users/${userEngineerA._id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${tokenAdminA}`
      }
    });
    assert.strictEqual(resDelete.status, 204);

    // Give fire-and-forget logs a moment to register
    await new Promise(resolve => setTimeout(resolve, 100));

    // Fetch audit logs
    const resLogs = await fetch(`${baseUrl}/audit-logs?limit=50`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });
    assert.strictEqual(resLogs.status, 200);
    const logsBody = await resLogs.json();
    
    // The logs are sorted newest-first
    const logs = logsBody.data;

    const deleteLog = logs.find(l => l.action === 'user.deleted' && l.targetId.toString() === userEngineerA._id.toString());
    const inviteLog = logs.find(l => l.action === 'user.invited' && l.targetId.toString() === invitedUserId.toString());
    const updateLog = logs.find(l => l.action === 'org.updated' && l.targetId.toString() === orgA._id.toString());
    const roleLog = logs.find(l => l.action === 'user.role_changed' && l.targetId.toString() === userEngineerA._id.toString());

    assert.ok(deleteLog, 'Should log user.deleted');

    assert.ok(inviteLog, 'Should log user.invited');
    assert.deepStrictEqual(inviteLog.metadata, { invitedRole: 'viewer' });

    assert.ok(updateLog, 'Should log org.updated');
    assert.deepStrictEqual(updateLog.metadata.updatedFields, ['name']);

    assert.ok(roleLog, 'Should log user.role_changed');
    assert.deepStrictEqual(roleLog.metadata, { fromRole: 'devops_engineer', toRole: 'team_lead' });
  });
});
