const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');
const { hashPassword, comparePassword } = require('../../src/utils/password');

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

describe('User Self-Service Profile Endpoints Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let userA;
  let tokenA;
  const rawPassword = 'OldPassword123!';

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

    // Seed Org
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a' });
    await orgA.save();

    // Seed User
    const hashedPassword = await hashPassword(rawPassword);
    userA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      name: 'Old Name',
      email: 'user@a.com',
      role: 'devops_engineer',
      passwordHash: hashedPassword,
      isActive: true
    });
    await userA.save();

    tokenA = generateAccessToken({
      userId: userA._id,
      orgId: userA.orgId,
      role: userA.role
    });
  });

  describe('GET /users/me', () => {
    test('should return profile details of the authenticated user', async () => {
      const response = await fetch(`${baseUrl}/users/me`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();

      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.id, userA._id.toString());
      assert.strictEqual(body.data.name, 'Old Name');
      assert.strictEqual(body.data.email, 'user@a.com');
      assert.strictEqual(body.data.role, 'devops_engineer');
      assert.strictEqual(body.data.orgId, orgA._id.toString());
    });

    test('should return 401 UNAUTHORIZED if no authorization header is sent', async () => {
      const response = await fetch(`${baseUrl}/users/me`);
      assert.strictEqual(response.status, 401);
    });
  });

  describe('PATCH /users/me', () => {
    test('should successfully update the user\'s name', async () => {
      const response = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({ name: 'New Name' })
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.name, 'New Name');

      // Verify persistent in db
      const user = mockUserDB.find(x => x._id.toString() === userA._id.toString());
      assert.strictEqual(user.name, 'New Name');
    });

    test('should successfully update password with correct current password', async () => {
      const response = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({
          currentPassword: rawPassword,
          newPassword: 'NewPassword123!'
        })
      });

      assert.strictEqual(response.status, 200);
      const body = await response.json();
      assert.strictEqual(body.success, true);

      // Verify password hash changed and compares correctly
      const user = mockUserDB.find(x => x._id.toString() === userA._id.toString());
      const isOldMatch = await comparePassword(rawPassword, user.passwordHash);
      const isNewMatch = await comparePassword('NewPassword123!', user.passwordHash);

      assert.strictEqual(isOldMatch, false, 'Old password should no longer match');
      assert.strictEqual(isNewMatch, true, 'New password should match');
    });

    test('should return 401 UNAUTHORIZED when providing incorrect current password', async () => {
      const response = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({
          currentPassword: 'WrongOldPassword',
          newPassword: 'NewPassword123!'
        })
      });

      assert.strictEqual(response.status, 401);
      const body = await response.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'UNAUTHORIZED');
    });

    test('should return 400 VALIDATION_ERROR when missing currentPassword when newPassword is sent', async () => {
      const response = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({
          newPassword: 'NewPassword123!'
        })
      });

      assert.strictEqual(response.status, 400);
    });

    test('should return 400 VALIDATION_ERROR when weak new password is sent', async () => {
      const response = await fetch(`${baseUrl}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({
          currentPassword: rawPassword,
          newPassword: 'short' // weak password
        })
      });

      assert.strictEqual(response.status, 400);
    });
  });
});
