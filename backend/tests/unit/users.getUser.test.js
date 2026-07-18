const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

// Mock data stores / controls
let mockUserResult = null;
let mockFindOneQuery = null;

// Mock model implementation
const mockUserModel = {
  findOne(filter, projection, options) {
    mockFindOneQuery = { filter, projection, options };
    return {
      select(fields) {
        mockFindOneQuery.select = fields;
        return this;
      },
      then(resolve, reject) {
        resolve(mockUserResult);
      }
    };
  }
};

// Override mongoose.model
const originalModel = mongoose.model;
mongoose.model = function(name, schema) {
  if (name === 'User') {
    return mockUserModel;
  }
  return originalModel.call(mongoose, name, schema);
};

// Now require controller (which requires User model)
const { getUser } = require('../../src/controllers/users.controller');
const ApiError = require('../../src/utils/apiError');

describe('getUser Unit Tests', () => {
  beforeEach(() => {
    mockUserResult = null;
    mockFindOneQuery = null;
  });

  test('should return correct user document (minus password hash) for same-org match', async () => {
    const validId = '64b0f0278783be3eb87a950a';
    const mockUser = {
      _id: new mongoose.Types.ObjectId(validId),
      email: 'test@org.com',
      role: 'devops_engineer',
      isActive: true,
      passwordHash: 'hashedpassword',
      toObject() {
        return {
          _id: this._id,
          email: this.email,
          role: this.role,
          isActive: this.isActive,
          passwordHash: this.passwordHash
        };
      }
    };

    mockUserResult = mockUser;

    let nextCalled = null;
    const mockReq = {
      params: { id: validId },
      context: { orgId: 'org_aaaaa', userId: 'usr_1', role: 'org_admin' }
    };

    const mockRes = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      }
    };

    const mockNext = (err) => {
      nextCalled = err;
    };

    await getUser(mockReq, mockRes, mockNext);

    assert.strictEqual(nextCalled, null);
    assert.strictEqual(mockRes.statusCode, 200);
    assert.deepStrictEqual(mockRes.body, {
      success: true,
      data: {
        _id: mockUser._id,
        id: validId,
        email: 'test@org.com',
        role: 'devops_engineer',
        isActive: true
      },
      meta: null,
      error: null
    });
    // Check that scopedFindOne queried with correct filter
    assert.deepStrictEqual(mockFindOneQuery.filter, {
      _id: validId,
      orgId: 'org_aaaaa'
    });
    // Check that passwordHash was excluded via select
    assert.strictEqual(mockFindOneQuery.select, '-passwordHash');
  });

  test('should call next with 404 ApiError (USER_NOT_FOUND) for different-org id', async () => {
    const validId = '64b0f0278783be3eb87a950b';
    mockUserResult = null; // different org/tenant context returns null from query

    let nextCalled = null;
    const mockReq = {
      params: { id: validId },
      context: { orgId: 'org_aaaaa', userId: 'usr_1', role: 'org_admin' }
    };

    const mockRes = {
      status() { return this; },
      json() { return this; }
    };

    const mockNext = (err) => {
      nextCalled = err;
    };

    await getUser(mockReq, mockRes, mockNext);

    assert.ok(nextCalled instanceof ApiError);
    assert.strictEqual(nextCalled.statusCode, 404);
    assert.strictEqual(nextCalled.code, 'USER_NOT_FOUND');
    assert.strictEqual(nextCalled.message, 'User not found in organization');
  });

  test('should call next with 404 ApiError (USER_NOT_FOUND) for nonexistent-but-valid-format id', async () => {
    const validId = '64b0f0278783be3eb87a950c';
    mockUserResult = null;

    let nextCalled = null;
    const mockReq = {
      params: { id: validId },
      context: { orgId: 'org_aaaaa', userId: 'usr_1', role: 'org_admin' }
    };

    const mockRes = {
      status() { return this; },
      json() { return this; }
    };

    const mockNext = (err) => {
      nextCalled = err;
    };

    await getUser(mockReq, mockRes, mockNext);

    assert.ok(nextCalled instanceof ApiError);
    assert.strictEqual(nextCalled.statusCode, 404);
    assert.strictEqual(nextCalled.code, 'USER_NOT_FOUND');
    assert.strictEqual(nextCalled.message, 'User not found in organization');
  });

  test('should call next with 404 ApiError (USER_NOT_FOUND) for malformed id format', async () => {
    const malformedId = 'not-an-object-id';
    mockUserResult = null;

    let nextCalled = null;
    const mockReq = {
      params: { id: malformedId },
      context: { orgId: 'org_aaaaa', userId: 'usr_1', role: 'org_admin' }
    };

    const mockRes = {
      status() { return this; },
      json() { return this; }
    };

    const mockNext = (err) => {
      nextCalled = err;
    };

    await getUser(mockReq, mockRes, mockNext);

    assert.ok(nextCalled instanceof ApiError);
    assert.strictEqual(nextCalled.statusCode, 404);
    assert.strictEqual(nextCalled.code, 'USER_NOT_FOUND');
    assert.strictEqual(nextCalled.message, 'User not found in organization');
  });
});
