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

describe('Organization Profile Endpoints Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let orgB;

  let userAdminA;
  let userViewerA;
  let userAdminB;

  let tokenAdminA;
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
    orgA = new mockOrganizationModel({
      _id: new mongoose.Types.ObjectId(),
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'free',
      notificationDefaults: { alertEmailRecipients: ['ops@acme.com'] }
    });
    await orgA.save();

    orgB = new mockOrganizationModel({
      _id: new mongoose.Types.ObjectId(),
      name: 'Cyberdyne Systems',
      slug: 'cyberdyne-systems',
      plan: 'pro',
      notificationDefaults: { alertEmailRecipients: ['admin@cyberdyne.com'] }
    });
    await orgB.save();

    // Seed Users
    userAdminA = {
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'admin@acme.com',
      role: 'org_admin',
      isActive: true
    };
    userViewerA = {
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'viewer@acme.com',
      role: 'viewer',
      isActive: true
    };
    userAdminB = {
      _id: new mongoose.Types.ObjectId(),
      orgId: orgB._id,
      email: 'admin@cyberdyne.com',
      role: 'org_admin',
      isActive: true
    };

    mockUserDB.push(userAdminA, userViewerA, userAdminB);

    // Generate JWT access tokens
    tokenAdminA = generateAccessToken({
      userId: userAdminA._id,
      orgId: userAdminA.orgId,
      role: userAdminA.role
    });
    tokenViewerA = generateAccessToken({
      userId: userViewerA._id,
      orgId: userViewerA.orgId,
      role: userViewerA.role
    });
    tokenAdminB = generateAccessToken({
      userId: userAdminB._id,
      orgId: userAdminB.orgId,
      role: userAdminB.role
    });
  });

  describe('GET /organizations/me', () => {
    test('should return org details for an authenticated org_admin', async () => {
      const response = await fetch(`${baseUrl}/organizations/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();

      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.id, orgA._id.toString());
      assert.strictEqual(body.data.name, 'Acme Corp');
      assert.strictEqual(body.data.slug, 'acme-corp');
      assert.strictEqual(body.data.plan, 'free');
      assert.deepEqual(body.data.notificationDefaults.alertEmailRecipients, ['ops@acme.com']);
    });

    test('should return org details for an authenticated viewer (any role)', async () => {
      const response = await fetch(`${baseUrl}/organizations/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokenViewerA}` }
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();

      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.id, orgA._id.toString());
    });

    test('should return correct distinct organization for different tenant (cross-tenant isolation check)', async () => {
      const response = await fetch(`${baseUrl}/organizations/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokenAdminB}` }
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();

      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.id, orgB._id.toString());
      assert.strictEqual(body.data.name, 'Cyberdyne Systems');
    });

    test('should return 401 UNAUTHORIZED if not authenticated', async () => {
      const response = await fetch(`${baseUrl}/organizations/me`, {
        method: 'GET'
      });

      assert.strictEqual(response.status, 401);
    });
  });

  describe('PUT /organizations/me', () => {
    test('should successfully update name and notificationDefaults as org_admin', async () => {
      const payload = {
        name: 'Acme Corporation',
        notificationDefaults: {
          alertEmailRecipients: ['ops@acme.com', 'cto@acme.com']
        }
      };

      const response = await fetch(`${baseUrl}/organizations/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();

      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.name, 'Acme Corporation');
      assert.strictEqual(body.data.slug, 'acme-corporation'); // slug automatically regenerated
      assert.deepEqual(body.data.notificationDefaults.alertEmailRecipients, ['ops@acme.com', 'cto@acme.com']);

      // Double-verify via subsequent fetch
      const fetchResponse = await fetch(`${baseUrl}/organizations/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });
      const fetchBody = await fetchResponse.json();
      assert.strictEqual(fetchBody.data.name, 'Acme Corporation');
    });

    test('should return 403 FORBIDDEN if a non-org_admin (e.g. viewer) attempts update', async () => {
      const payload = {
        name: 'Hacked Corp'
      };

      const response = await fetch(`${baseUrl}/organizations/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenViewerA}`
        },
        body: JSON.stringify(payload)
      });

      assert.strictEqual(response.status, 403);
      const body = await response.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'FORBIDDEN');

      // Verify no change persisted on Org A
      const fetchResponse = await fetch(`${baseUrl}/organizations/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });
      const fetchBody = await fetchResponse.json();
      assert.strictEqual(fetchBody.data.name, 'Acme Corp');
    });

    test('should return 400 VALIDATION_ERROR on invalid name length or email format', async () => {
      // 1. Name too short
      const resShortName = await fetch(`${baseUrl}/organizations/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({ name: 'A' })
      });
      assert.strictEqual(resShortName.status, 400);

      // 2. Invalid email format
      const resBadEmail = await fetch(`${baseUrl}/organizations/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminA}`
        },
        body: JSON.stringify({
          notificationDefaults: { alertEmailRecipients: ['not-an-email'] }
        })
      });
      assert.strictEqual(resBadEmail.status, 400);
      const badEmailBody = await resBadEmail.json();
      assert.strictEqual(badEmailBody.success, false);
      assert.strictEqual(badEmailBody.error.code, 'VALIDATION_ERROR');
    });

    test('should maintain strict tenant isolation - update on Org B does not affect Org A', async () => {
      const payload = {
        name: 'Cyberdyne Systems V2',
        notificationDefaults: {
          alertEmailRecipients: ['admin2@cyberdyne.com']
        }
      };

      const responseB = await fetch(`${baseUrl}/organizations/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenAdminB}`
        },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(responseB.status, 200);

      // Fetch Org A to confirm it was not updated or affected
      const responseA = await fetch(`${baseUrl}/organizations/me`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokenAdminA}` }
      });
      const bodyA = await responseA.json();
      assert.strictEqual(bodyA.data.name, 'Acme Corp'); // original name unaffected
      assert.deepEqual(bodyA.data.notificationDefaults.alertEmailRecipients, ['ops@acme.com']); // original defaults unaffected
    });
  });
});
