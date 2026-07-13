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
mockOrganizationModel.countDocuments = async function() {
  return mockOrgDB.length;
};

const mockUserModel = function(data) {
  this._id = data._id || new mongoose.Types.ObjectId();
  Object.assign(this, data);
  this.save = async function() {
    mockUserDB.push(this);
    return this;
  };
};
mockUserModel.countDocuments = async function(query) {
  return mockUserDB.filter(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  }).length;
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

describe('Platform Administration Endpoints Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let orgB;

  let userAdminA;
  let userAdminB;
  let userEngineerB;
  let userSuperAdmin;

  let tokenAdminA;
  let tokenEngineerB;
  let tokenSuperAdmin;

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
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a', isActive: true });
    orgB = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org B', slug: 'org-b', isActive: true });
    await orgA.save();
    await orgB.save();

    // Seed Users
    userAdminA = new mockUserModel({ _id: new mongoose.Types.ObjectId(), orgId: orgA._id, email: 'admin@a.com', role: 'org_admin', isActive: true });
    userAdminB = new mockUserModel({ _id: new mongoose.Types.ObjectId(), orgId: orgB._id, email: 'admin@b.com', role: 'org_admin', isActive: true });
    userEngineerB = new mockUserModel({ _id: new mongoose.Types.ObjectId(), orgId: orgB._id, email: 'engineer@b.com', role: 'devops_engineer', isActive: true });
    
    // Super admin user - orgId is null by design
    userSuperAdmin = new mockUserModel({ _id: new mongoose.Types.ObjectId(), orgId: null, email: 'platform-admin@system.com', role: 'super_admin', isActive: true });

    await userAdminA.save();
    await userAdminB.save();
    await userEngineerB.save();
    await userSuperAdmin.save();

    // Generate JWT access tokens
    tokenAdminA = generateAccessToken({ userId: userAdminA._id, orgId: userAdminA.orgId, role: userAdminA.role });
    tokenEngineerB = generateAccessToken({ userId: userEngineerB._id, orgId: userEngineerB.orgId, role: userEngineerB.role });
    tokenSuperAdmin = generateAccessToken({ userId: userSuperAdmin._id, orgId: userSuperAdmin.orgId, role: userSuperAdmin.role });
  });

  describe('GET /platform/organizations', () => {
    test('should allow fetching the organization list with aggregates for super_admin role', async () => {
      const response = await fetch(`${baseUrl}/platform/organizations`, {
        headers: { 'Authorization': `Bearer ${tokenSuperAdmin}` }
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();

      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.length, 2);
      assert.strictEqual(body.meta.total, 2);

      // Verify Org A aggregates
      const mappedOrgA = body.data.find(x => x.id === orgA._id.toString());
      assert.ok(mappedOrgA);
      assert.strictEqual(mappedOrgA.name, 'Org A');
      assert.strictEqual(mappedOrgA.userCount, 1); // Only userAdminA
      assert.strictEqual(mappedOrgA.resourceCount, 0);
      assert.strictEqual(mappedOrgA.activeAlertCount, 0);
      assert.strictEqual(mappedOrgA.isActive, true);

      // Verify Org B aggregates
      const mappedOrgB = body.data.find(x => x.id === orgB._id.toString());
      assert.ok(mappedOrgB);
      assert.strictEqual(mappedOrgB.name, 'Org B');
      assert.strictEqual(mappedOrgB.userCount, 2); // userAdminB + userEngineerB
      assert.strictEqual(mappedOrgB.resourceCount, 0);
      assert.strictEqual(mappedOrgB.activeAlertCount, 0);
      assert.strictEqual(mappedOrgB.isActive, true);

      // Verify only documented fields exist
      const keys = Object.keys(mappedOrgA);
      const expectedKeys = ['id', 'name', 'userCount', 'resourceCount', 'activeAlertCount', 'isActive'];
      assert.strictEqual(keys.length, expectedKeys.length);
      keys.forEach(k => assert.ok(expectedKeys.includes(k)));
    });

    test('should block access to org_admin and return 403 Forbidden', async () => {
      const response = await fetch(`${baseUrl}/platform/organizations`, {
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });

      assert.strictEqual(response.status, 403);
      const body = await response.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'FORBIDDEN');
    });

    test('should block access to devops_engineer and return 403 Forbidden', async () => {
      const response = await fetch(`${baseUrl}/platform/organizations`, {
        headers: { 'Authorization': `Bearer ${tokenEngineerB}` }
      });

      assert.strictEqual(response.status, 403);
    });

    test('should block access to unauthenticated requests and return 401 Unauthorized', async () => {
      const response = await fetch(`${baseUrl}/platform/organizations`);
      assert.strictEqual(response.status, 401);
    });
  });
});
