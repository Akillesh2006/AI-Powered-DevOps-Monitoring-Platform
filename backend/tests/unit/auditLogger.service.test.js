const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

// Mock database store
let mockDB = [];

// Define mock model
const mockAuditLogModel = function(data) {
  Object.assign(this, data);
  this.save = async function() {
    if (mockAuditLogModel.shouldFail) {
      throw new Error('Forced Mongoose DB/save error');
    }
    mockDB.push(this);
    return this;
  };
};

mockAuditLogModel.shouldFail = false;

// Override mongoose.model to return our mocked model
const originalModel = mongoose.model;
mongoose.model = function(name, schema) {
  if (name === 'AuditLog') {
    return mockAuditLogModel;
  }
  // Fallback to original/stub
  if (originalModel) {
    try {
      return originalModel.call(mongoose, name, schema);
    } catch (e) {
      // Ignored if model already compiled or registers differently
    }
  }
  return class MockModel {
    constructor(data) { Object.assign(this, data); }
  };
};

// Now import the service which will use our mocked mongoose.model
const { logAudit } = require('../../src/services/auditLogger.service');

describe('Audit Logger Service Unit Tests', () => {
  const mockOrgId = new mongoose.Types.ObjectId().toString();
  const mockActorUserId = new mongoose.Types.ObjectId().toString();
  const mockTargetId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    mockDB = [];
    mockAuditLogModel.shouldFail = false;
  });

  test('should successfully persist AuditLog with correct fields on valid input', async () => {
    const input = {
      orgId: mockOrgId,
      actorUserId: mockActorUserId,
      action: 'user.role_changed',
      targetType: 'User',
      targetId: mockTargetId,
      metadata: { fromRole: 'viewer', toRole: 'org_admin' }
    };

    const result = await logAudit(input);
    
    assert.ok(result, 'logAudit should return the saved document on success');
    assert.strictEqual(mockDB.length, 1);
    
    const saved = mockDB[0];
    assert.strictEqual(saved.orgId, input.orgId);
    assert.strictEqual(saved.actorUserId, input.actorUserId);
    assert.strictEqual(saved.action, input.action);
    assert.strictEqual(saved.targetType, input.targetType);
    assert.strictEqual(saved.targetId, input.targetId);
    assert.deepStrictEqual(saved.metadata, input.metadata);
  });

  test('should resolve to undefined and swallow error when DB save fails', async () => {
    mockAuditLogModel.shouldFail = true;

    const input = {
      orgId: mockOrgId,
      actorUserId: mockActorUserId,
      action: 'user.role_changed',
      targetType: 'User',
      targetId: mockTargetId,
      metadata: { fromRole: 'viewer', toRole: 'org_admin' }
    };

    // Capture console.error to check that it is logged
    const originalConsoleError = console.error;
    let loggedError = null;
    console.error = (msg, err) => {
      loggedError = { msg, err };
    };

    try {
      const result = await logAudit(input);
      assert.strictEqual(result, undefined, 'logAudit should return undefined on failure');
      assert.strictEqual(mockDB.length, 0, 'No document should be saved to DB');
      assert.ok(loggedError, 'An error should have been logged to console.error');
      assert.ok(loggedError.msg.includes('Audit logging failed'));
    } finally {
      // Restore console.error
      console.error = originalConsoleError;
    }
  });
});
