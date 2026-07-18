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
};
mockUserModel.findOne = async function(query) {
  // Support simple field matches like email, _id, or orgId
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

  // return chains for pagination testing
  const chainObj = {
    skip: function() { return this; },
    limit: function() { return this; },
    then: function(resolve) { resolve(matched); },
    catch: function(reject) { reject(new Error('Mock query error')); }
  };
  // Ensure it behaves as a promise too
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
};
mockUserModel.countDocuments = async function(query) {
  return mockUserDB.filter(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  }).length;
};
mockUserModel.deleteOne = async function(query) {
  const initialLength = mockUserDB.length;
  mockUserDB = mockUserDB.filter(user => {
    return !Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  });
  return { deletedCount: initialLength - mockUserDB.length };
};
mockUserModel.updateOne = async function(query, update) {
  const doc = mockUserDB.find(user => {
    return Object.keys(query).every(key => {
      if (!user[key] || !query[key]) return false;
      return user[key].toString() === query[key].toString();
    });
  });

  if (doc) {
    if (update.$set) {
      Object.assign(doc, update.$set);
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }
  return { matchedCount: 0, modifiedCount: 0 };
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

describe('User Management Endpoints Integration Tests', () => {
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

    // Seed Organizations
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a' });
    orgB = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org B', slug: 'org-b' });
    await orgA.save();
    await orgB.save();

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
    userViewerA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'viewer@a.com',
      role: 'viewer',
      isActive: true
    });
    userAdminB = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgB._id,
      email: 'admin@b.com',
      role: 'org_admin',
      isActive: true
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
  });

  describe('GET /users', () => {
    test('should allow listing users for org_admin, devops_engineer, and team_lead', async () => {
      const resAdmin = await fetch(`${baseUrl}/users`, {
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });
      assert.strictEqual(resAdmin.status, 200);
      const bodyAdmin = await resAdmin.json();
      assert.strictEqual(bodyAdmin.success, true);
      assert.strictEqual(bodyAdmin.data.length, 3); // Admin A, Engineer A, Viewer A
      assert.strictEqual(bodyAdmin.meta.total, 3);

      const resEng = await fetch(`${baseUrl}/users`, {
        headers: { 'Authorization': `Bearer ${tokenEngineerA}` }
      });
      assert.strictEqual(resEng.status, 200);
    });

    test('should block listing users for viewer (returns 403)', async () => {
      const response = await fetch(`${baseUrl}/users`, {
        headers: { 'Authorization': `Bearer ${tokenViewerA}` }
      });
      assert.strictEqual(response.status, 403);
    });

    test('should enforce strict tenant isolation (Admin B only sees Org B users)', async () => {
      const response = await fetch(`${baseUrl}/users`, {
        headers: { 'Authorization': `Bearer ${tokenAdminB}` }
      });
      assert.strictEqual(response.status, 200);
      const body = await response.json();
      assert.strictEqual(body.data.length, 1);
      assert.strictEqual(body.data[0].email, 'admin@b.com');
    });
  });

  describe('POST /users/invite', () => {
    test('should successfully invite a new user to the organization as org_admin', async () => {
      const payload = { email: 'new-engineer@a.com', role: 'devops_engineer' };

      const response = await fetch(`${baseUrl}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(response.status, 201);
      const body = await response.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.email, 'new-engineer@a.com');
      assert.strictEqual(body.data.role, 'devops_engineer');
      assert.strictEqual(body.data.status, 'invited');

      // Verify added in mock database
      const found = mockUserDB.find(x => x.email === 'new-engineer@a.com');
      assert.ok(found);
      assert.strictEqual(found.orgId.toString(), orgA._id.toString());
    });

    test('should return 409 if trying to invite an email that already exists in the organization', async () => {
      const payload = { email: 'engineer@a.com', role: 'viewer' }; // engineer@a.com already exists

      const response = await fetch(`${baseUrl}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(response.status, 409);
      const body = await response.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'DUPLICATE_RESOURCE');
    });

    test('should return 422 if role is invalid or is super_admin', async () => {
      const payload = { email: 'hacker@a.com', role: 'super_admin' };

      const response = await fetch(`${baseUrl}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(response.status, 422);
    });

    test('should block invitations from non-org_admin users (returns 403)', async () => {
      const response = await fetch(`${baseUrl}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenViewerA}`
        },
        body: JSON.stringify({ email: 'guest@a.com', role: 'viewer' })
      });
      assert.strictEqual(response.status, 403);
    });
  });

  describe('PATCH /users/:id/role', () => {
    test('should successfully update a user\'s role as org_admin', async () => {
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

      // Verify persistent in db
      const user = mockUserDB.find(x => x._id.toString() === userEngineerA._id.toString());
      assert.strictEqual(user.role, 'team_lead');
    });

    test('should return 400 when attempting to demote the last remaining org_admin', async () => {
      const response = await fetch(`${baseUrl}/users/${userAdminA._id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({ role: 'devops_engineer' }) // Admin A is the last admin in Org A
      });

      assert.strictEqual(response.status, 400);
      const body = await response.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'BAD_REQUEST');
      assert.ok(body.error.message.includes('last remaining'));
    });

    test('should return 404 NOT_FOUND if attempting to update a user belonging to another organization', async () => {
      // Admin A tries to modify Admin B's role
      const response = await fetch(`${baseUrl}/users/${userAdminB._id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({ role: 'devops_engineer' })
      });

      assert.strictEqual(response.status, 404);
    });
  });

  describe('DELETE /users/:id', () => {
    test('should successfully delete a user as org_admin', async () => {
      const response = await fetch(`${baseUrl}/users/${userEngineerA._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });

      assert.strictEqual(response.status, 204);

      // Verify soft-deleted in mock db
      const found = mockUserDB.find(x => x._id.toString() === userEngineerA._id.toString());
      assert.ok(found);
      assert.strictEqual(found.isDeleted, true);
    });

    test('should return 400 when attempting to delete the last remaining org_admin', async () => {
      const response = await fetch(`${baseUrl}/users/${userAdminA._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });

      assert.strictEqual(response.status, 400);
    });

    test('should return 404 if attempting to delete a user belonging to another organization', async () => {
      const response = await fetch(`${baseUrl}/users/${userAdminB._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });

      assert.strictEqual(response.status, 404);
    });
  });
});
