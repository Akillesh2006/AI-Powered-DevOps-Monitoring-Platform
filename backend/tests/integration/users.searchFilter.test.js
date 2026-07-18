const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];

// Helper to mimic simple MongoDB query matching
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

mockUserModel.find = function(query) {
  let matched = mockUserDB.filter(user => matchMongoQuery(user, query));

  const chainObj = {
    skip: function(s) { 
      this._skip = s;
      return this; 
    },
    limit: function(l) { 
      this._limit = l;
      return this; 
    },
    then: function(resolve) {
      let result = matched;
      if (this._skip !== undefined) {
        result = result.slice(this._skip);
      }
      if (this._limit !== undefined) {
        result = result.slice(0, this._limit);
      }
      resolve(result); 
    },
    catch: function(reject) { reject(new Error('Mock query error')); }
  };
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
};

mockUserModel.countDocuments = async function(query) {
  return mockUserDB.filter(user => matchMongoQuery(user, query)).length;
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

describe('User Search and Filter Endpoint Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let orgB;

  let adminA;
  let user1; // Jane Doe, viewer, active
  let user2; // John Smith, engineer, active
  let user3; // Alice Jane, viewer, inactive
  
  let adminB;
  let user4; // Jane Miller, admin, active

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

    // Seed Organizations
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a' });
    orgB = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org B', slug: 'org-b' });
    await orgA.save();
    await orgB.save();

    // Seed Users
    adminA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'admin@a.com',
      role: 'org_admin',
      isActive: true,
      name: 'Admin A'
    });
    user1 = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'jane@a.com',
      role: 'viewer',
      isActive: true,
      name: 'Jane Doe'
    });
    user2 = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'john@a.com',
      role: 'devops_engineer',
      isActive: true,
      name: 'John Smith'
    });
    user3 = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'alice@a.com',
      role: 'viewer',
      isActive: false,
      name: 'Alice Jane'
    });

    adminB = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgB._id,
      email: 'admin@b.com',
      role: 'org_admin',
      isActive: true,
      name: 'Admin B'
    });
    user4 = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgB._id,
      email: 'jane@b.com',
      role: 'viewer',
      isActive: true,
      name: 'Jane Miller'
    });

    await adminA.save();
    await user1.save();
    await user2.save();
    await user3.save();
    await adminB.save();
    await user4.save();

    // Generate JWT access tokens
    tokenAdminA = generateAccessToken({ userId: adminA._id, orgId: adminA.orgId, role: adminA.role });
    tokenAdminB = generateAccessToken({ userId: adminB._id, orgId: adminB.orgId, role: adminB.role });
  });

  test('GET /users (no params) - should return all users in organization with correct defaults', async () => {
    const response = await fetch(`${baseUrl}/users`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    // adminA, user1, user2, user3 are all in orgA
    assert.strictEqual(body.data.length, 4);
    assert.strictEqual(body.meta.total, 4);
    assert.strictEqual(body.meta.page, 1);
    assert.strictEqual(body.meta.limit, 25);
  });

  test('GET /users?role=viewer - should filter users by role successfully', async () => {
    const response = await fetch(`${baseUrl}/users?role=viewer`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.data.length, 2); // user1 and user3 are viewers in orgA
    assert.strictEqual(body.meta.total, 2);
    
    const roles = body.data.map(u => u.role);
    assert.ok(roles.includes('viewer'));
    assert.ok(!roles.includes('devops_engineer'));
  });

  test('GET /users?isActive=false - should filter users by active status successfully', async () => {
    const response = await fetch(`${baseUrl}/users?isActive=false`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.data.length, 1); // user3 is inactive in orgA
    assert.strictEqual(body.meta.total, 1);
    assert.strictEqual(body.data[0].id, user3._id.toString());
  });

  test('GET /users?search=jane - should return case-insensitive match on name or email', async () => {
    const response = await fetch(`${baseUrl}/users?search=jane`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    // In orgA: Jane Doe (user1 name matches 'Jane'), Alice Jane (user3 name matches 'Jane'), jane@a.com (user1 email matches 'jane')
    assert.strictEqual(body.data.length, 2);
    assert.strictEqual(body.meta.total, 2);

    const ids = body.data.map(u => u.id);
    assert.ok(ids.includes(user1._id.toString()));
    assert.ok(ids.includes(user3._id.toString()));
  });

  test('GET /users?role=viewer&search=jane&page=1&limit=1 - should combine filter, search, and pagination', async () => {
    const response = await fetch(`${baseUrl}/users?role=viewer&search=jane&page=1&limit=1`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    // Filter/search matches: user1 (viewer & jane) and user3 (viewer & jane).
    // Limit is 1, so returned data has 1 item, but meta.total should be 2.
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.meta.total, 2);
    assert.strictEqual(body.meta.totalPages, 2);
  });

  test('GET /users?search=jane - should enforce tenant isolation (never leaking other orgs)', async () => {
    // Admin B searches for 'jane'. Jane Miller (user4 in orgB) matches.
    // Jane Doe (user1 in orgA) and Alice Jane (user3 in orgA) must NOT be returned.
    const response = await fetch(`${baseUrl}/users?search=jane`, {
      headers: { 'Authorization': `Bearer ${tokenAdminB}` }
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.meta.total, 1);
    assert.strictEqual(body.data[0].id, user4._id.toString());
  });
});
