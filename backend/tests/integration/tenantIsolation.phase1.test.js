const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');
const { seedTwoOrgs } = require('../fixtures/twoOrgSeed');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];

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
mockOrganizationModel.find = function(query) {
  const matched = mockOrgDB.filter(org => {
    return Object.keys(query).every(key => {
      if (!org[key] || !query[key]) return false;
      return org[key].toString() === query[key].toString();
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
mockOrganizationModel.countDocuments = async function() { return mockOrgDB.length; };

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
mockUserModel.countDocuments = async function(query = {}) {
  return mockUserDB.filter(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  }).length;
};
mockUserModel.deleteOne = async function(query) {
  const index = mockUserDB.findIndex(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  });
  if (index !== -1) {
    mockUserDB.splice(index, 1);
    return { deletedCount: 1 };
  }
  return { deletedCount: 0 };
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

describe('Multi-Tenant Isolation Integration Tests (Phase 1)', () => {
  let server;
  let baseUrl;

  let orgA;
  let orgB;
  let adminA;
  let adminB;
  let engineerB;

  let tokenAdminA;
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

    // Seed fixture
    const seed = await seedTwoOrgs(mockOrganizationModel, mockUserModel);
    orgA = seed.orgA;
    orgB = seed.orgB;

    adminA = seed.orgAUsers.find(u => u.role === 'org_admin');
    adminB = seed.orgBUsers.find(u => u.role === 'org_admin');
    engineerB = seed.orgBUsers.find(u => u.role === 'devops_engineer');

    // Generate JWTs
    tokenAdminA = generateAccessToken({ userId: adminA._id, orgId: orgA._id, role: 'org_admin' });
    tokenAdminB = generateAccessToken({ userId: adminB._id, orgId: orgB._id, role: 'org_admin' });
  });

  describe('TENANT-14: Cross-Tenant User Management Access Restrictions', () => {
    test('should prevent Org A admin from viewing Org B user details directly (returns 404/403, never 200)', async () => {
      // Direct GET user detail (though currently GET /users/:id is not in routes, but checks for list/update/delete)
      // Check PATCH /users/:id/role of Org B user by Org A admin
      const response = await fetch(`${baseUrl}/users/${engineerB._id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({ role: 'team_lead' })
      });

      assert.strictEqual(response.status, 404); // Returns 404 because scopedFindOne doesn't see Org B user under Org A context
      const body = await response.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'RESOURCE_NOT_FOUND');
    });

    test('should prevent Org A admin from deleting/deactivating Org B user (returns 404, never 200)', async () => {
      const response = await fetch(`${baseUrl}/users/${engineerB._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${tokenAdminA}`
        }
      });

      assert.strictEqual(response.status, 404);
      const body = await response.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'RESOURCE_NOT_FOUND');

      // Verify Globex engineer user was NOT deleted in database
      const exists = mockUserDB.find(u => u._id.toString() === engineerB._id.toString());
      assert.ok(exists);
    });
  });

  describe('TENANT-15: Org A user list (GET /users) never includes Org B\'s users', () => {
    test('should return only Org A users, completely excluding Org B users', async () => {
      const response = await fetch(`${baseUrl}/users`, {
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();

      assert.strictEqual(body.success, true);
      // Org A has 2 users: Acme Admin User and Acme Engineer User
      assert.strictEqual(body.data.length, 2);

      // Confirm no user in the response belongs to Org B (Globex)
      body.data.forEach(user => {
        assert.ok(user.email.includes('@acme.com'));
        assert.ok(!user.email.includes('@globex.com'));
      });
    });
  });

  describe('TENANT-16: Bypass scoping by smuggling a foreign orgId', () => {
    test('should ignore foreign orgId passed in request body when inviting a user (uses token orgId)', async () => {
      const response = await fetch(`${baseUrl}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({
          email: 'smuggled-user@acme.com',
          role: 'viewer',
          orgId: orgB._id.toString() // Foreign Globex orgId smuggled in body
        })
      });

      assert.strictEqual(response.status, 201);
      const body = await response.json();
      assert.strictEqual(body.success, true);

      // Verify db user record is set to Org A
      const createdUser = mockUserDB.find(u => u.email === 'smuggled-user@acme.com');
      assert.ok(createdUser);
      assert.strictEqual(createdUser.orgId.toString(), orgA._id.toString());
    });

    test('should ignore foreign orgId passed in body when updating organization settings', async () => {
      const response = await fetch(`${baseUrl}/organizations/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({
          name: 'Acme Smuggled Corp',
          orgId: orgB._id.toString() // Trying to change org ID or hijack
        })
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.id, orgA._id.toString());

      // Verify Org A name changed, but org ID did not change
      const savedOrg = mockOrgDB.find(o => o._id.toString() === orgA._id.toString());
      assert.strictEqual(savedOrg.name, 'Acme Smuggled Corp');
      
      const globexOrg = mockOrgDB.find(o => o._id.toString() === orgB._id.toString());
      assert.strictEqual(globexOrg.name, 'Globex Industries'); // Org B unaffected
    });
  });
});
