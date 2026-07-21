const { test, describe } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const AuditLog = require('../../src/models/AuditLog');

describe('AuditLog Schema Unit Tests', () => {
  test('should validate a correct AuditLog document', () => {
    const validData = {
      orgId: new mongoose.Types.ObjectId(),
      actorUserId: new mongoose.Types.ObjectId(),
      action: 'user.role_changed',
      targetType: 'User',
      targetId: new mongoose.Types.ObjectId(),
      metadata: { fromRole: 'viewer', toRole: 'org_admin' }
    };

    const log = new AuditLog(validData);
    const validationError = log.validateSync();
    assert.strictEqual(validationError, undefined);

    assert.deepStrictEqual(log.orgId, validData.orgId);
    assert.deepStrictEqual(log.actorUserId, validData.actorUserId);
    assert.strictEqual(log.action, validData.action);
    assert.strictEqual(log.targetType, validData.targetType);
    assert.deepStrictEqual(log.targetId, validData.targetId);
    assert.deepStrictEqual(log.metadata, validData.metadata);
  });

  test('should default metadata to an empty object if omitted', () => {
    const log = new AuditLog({
      orgId: new mongoose.Types.ObjectId(),
      actorUserId: new mongoose.Types.ObjectId(),
      action: 'user.role_changed',
      targetType: 'User',
      targetId: new mongoose.Types.ObjectId()
    });

    assert.deepStrictEqual(log.metadata, {});
  });

  test('should fail validation when required fields are missing', () => {
    const log = new AuditLog({});
    const validationError = log.validateSync();
    assert.ok(validationError);
    assert.ok(validationError.errors.orgId);
    assert.ok(validationError.errors.actorUserId);
    assert.ok(validationError.errors.action);
    assert.ok(validationError.errors.targetType);
    assert.ok(validationError.errors.targetId);
  });

  test('should only define createdAt and not updatedAt timestamps', () => {
    assert.ok(AuditLog.schema.paths.createdAt, 'createdAt should be defined in schema paths');
    assert.strictEqual(AuditLog.schema.paths.updatedAt, undefined, 'updatedAt should not be defined in schema paths');
  });
});
