const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../../src/utils/jwt');
const ApiError = require('../../src/utils/apiError');

// 1. Define mock Mongoose models
let mockFindShouldThrowApiError = false;
let mockFindShouldThrowPlainError = false;

const mockOrganizationModel = function(data) {
  Object.assign(this, data);
};

mockOrganizationModel.find = function() {
  if (mockFindShouldThrowApiError) {
    throw new ApiError(400, 'BAD_REQUEST_TEST', 'Mock ApiError', ['detail1']);
  }
  if (mockFindShouldThrowPlainError) {
    throw new Error('Database failure');
  }

  // Default mock behavior
  const chainObj = {
    skip: function() { return this; },
    limit: function() { return this; },
    then: function(resolve) { resolve([]); },
    catch: function(reject) { reject(new Error('Mock query error')); }
  };
  chainObj[Symbol.toStringTag] = 'Promise';
  return chainObj;
};

mockOrganizationModel.countDocuments = async function() {
  return 0;
};

const mockUserModel = function(data) {
  Object.assign(this, data);
};

// Override mongoose.model to resolve mock models
const originalModel = mongoose.model;
mongoose.model = function(name) {
  if (name === 'Organization') return mockOrganizationModel;
  if (name === 'User') return mockUserModel;
  return class MockModel {};
};

// Mock mongoose.connect to bypass connection attempts
const originalConnect = mongoose.connect;
mongoose.connect = async () => mongoose;

// Load app
const app = require('../../src/app');

describe('errorHandler Wiring Integration Tests', () => {
  let server;
  let baseUrl;
  let tokenSuperAdmin;
  let originalConsoleError;
  let consoleErrorCalls = [];

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;

    // Stub console.error to avoid cluttering test outputs
    originalConsoleError = console.error;
    console.error = (...args) => {
      consoleErrorCalls.push(args);
    };

    // Seed super admin user claims (since list_platform requires it)
    const userSuperAdmin = { _id: new mongoose.Types.ObjectId(), orgId: null, role: 'super_admin' };
    tokenSuperAdmin = generateAccessToken({ userId: userSuperAdmin._id, orgId: userSuperAdmin.orgId, role: userSuperAdmin.role });
  });

  after(async () => {
    // Restore original functions
    mongoose.model = originalModel;
    mongoose.connect = originalConnect;
    console.error = originalConsoleError;
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(() => {
    mockFindShouldThrowApiError = false;
    mockFindShouldThrowPlainError = false;
    consoleErrorCalls = [];
  });

  test('should handle ApiError thrown in controller and respond with structured JSON', async () => {
    mockFindShouldThrowApiError = true;

    const response = await fetch(`${baseUrl}/platform/organizations`, {
      headers: { 'Authorization': `Bearer ${tokenSuperAdmin}` }
    });

    assert.strictEqual(response.status, 400);
    const body = await response.json();

    assert.deepStrictEqual(body, {
      success: false,
      data: null,
      meta: null,
      error: {
        code: 'BAD_REQUEST_TEST',
        message: 'Mock ApiError',
        details: ['detail1']
      }
    });
  });

  test('should fallback to 500 and respond with generic error for unhandled plain Error', async () => {
    mockFindShouldThrowPlainError = true;

    const response = await fetch(`${baseUrl}/platform/organizations`, {
      headers: { 'Authorization': `Bearer ${tokenSuperAdmin}` }
    });

    assert.strictEqual(response.status, 500);
    const body = await response.json();

    assert.strictEqual(body.success, false);
    assert.strictEqual(body.data, null);
    assert.strictEqual(body.meta, null);
    assert.strictEqual(body.error.code, 'INTERNAL_ERROR');
    assert.notStrictEqual(body.error.message, 'Database failure');
    assert.strictEqual(typeof body.error.message, 'string');
    assert.deepStrictEqual(body.error.details, []);

    // Verify console.error was invoked with the thrown Error
    assert.ok(consoleErrorCalls.length > 0);
    assert.ok(consoleErrorCalls[0][0] instanceof Error);
    assert.strictEqual(consoleErrorCalls[0][0].message, 'Database failure');
  });
});
