const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');

// 1. Mock DB stores
let mockOrgDB = [];
let mockUserDB = [];

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

// Supply mock schema property to enable isDeleted filter inside scopedFind/scopedFindOne
mockUserModel.schema = {
  paths: {
    isDeleted: true
  }
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

mockUserModel.findOne = function(query) {
  const matched = mockUserDB.find(user => matchMongoQuery(user, query)) || null;

  const chainObj = {
    select: function() { return this; },
    then: function(resolve) { resolve(matched); },
    catch: function(reject) { reject(new Error('Mock query error')); }
  };
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
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

describe('User Soft Delete Endpoint Integration Tests', () => {
  let server;
  let baseUrl;

  let orgA;
  let adminA;
  let engineerA;

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

    // Seed Organization
    orgA = new mockOrganizationModel({ _id: new mongoose.Types.ObjectId(), name: 'Org A', slug: 'org-a' });
    await orgA.save();

    // Seed Users (adminA and engineerA in orgA)
    adminA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'admin@a.com',
      role: 'org_admin',
      isActive: true,
      name: 'Admin A',
      isDeleted: false,
      deletedAt: null
    });
    engineerA = new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgA._id,
      email: 'engineer@a.com',
      role: 'devops_engineer',
      isActive: true,
      name: 'Engineer A',
      isDeleted: false,
      deletedAt: null
    });

    await adminA.save();
    await engineerA.save();

    tokenAdminA = generateAccessToken({ userId: adminA._id, orgId: adminA.orgId, role: adminA.role });
  });

  test('DELETE /users/:id - should soft-delete the user successfully, excluding them from read results while retaining the doc in the store', async () => {
    // 1. Verify user exists in GET /users list and GET /users/:id details
    const listRes1 = await fetch(`${baseUrl}/users`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });
    const listBody1 = await listRes1.json();
    assert.strictEqual(listBody1.data.length, 2);

    // 2. Perform DELETE /users/:id
    const deleteRes = await fetch(`${baseUrl}/users/${engineerA._id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });
    assert.strictEqual(deleteRes.status, 204);

    // 3. Verify user is now excluded from GET /users list (filtered out)
    const listRes2 = await fetch(`${baseUrl}/users`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });
    const listBody2 = await listRes2.json();
    assert.strictEqual(listBody2.data.length, 1);
    assert.strictEqual(listBody2.data[0].id, adminA._id.toString());

    // 4. Verify GET /users/:id returns 404
    const detailRes = await fetch(`${baseUrl}/users/${engineerA._id}`, {
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });
    assert.strictEqual(detailRes.status, 404);
    const detailBody = await detailRes.json();
    assert.strictEqual(detailBody.success, false);
    assert.strictEqual(detailBody.error.code, 'USER_NOT_FOUND');

    // 5. Verify document is still present in mockUserDB but with isDeleted: true and deletedAt set
    const dbDoc = mockUserDB.find(x => x._id.toString() === engineerA._id.toString());
    assert.ok(dbDoc);
    assert.strictEqual(dbDoc.isDeleted, true);
    assert.ok(dbDoc.deletedAt instanceof Date);
  });

  test('DELETE /users/:id - last-admin protection rule should still block deletion of only admin', async () => {
    // Attempting to delete adminA (who is the only admin of orgA)
    const deleteRes = await fetch(`${baseUrl}/users/${adminA._id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenAdminA}` }
    });

    assert.strictEqual(deleteRes.status, 400);
    const deleteBody = await deleteRes.json();
    assert.strictEqual(deleteBody.success, false);
    assert.strictEqual(deleteBody.error.code, 'BAD_REQUEST');
    assert.ok(deleteBody.error.message.includes('last remaining'));

    // Verify adminA is NOT soft-deleted
    const dbDoc = mockUserDB.find(x => x._id.toString() === adminA._id.toString());
    assert.strictEqual(dbDoc.isDeleted, false);
    assert.strictEqual(dbDoc.deletedAt, null);
  });
});
