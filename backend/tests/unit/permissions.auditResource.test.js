const { test, describe } = require('node:test');
const assert = require('node:assert');
const { hasPermission } = require('../../src/config/permissions');

describe('RBAC Permission Matrix: audit:read Permission Tests', () => {
  test('should allow org_admin and super_admin to read audit logs', () => {
    assert.strictEqual(hasPermission('org_admin', 'audit', 'read'), true);
    assert.strictEqual(hasPermission('super_admin', 'audit', 'read'), true);
  });

  test('should deny audit log read access to all other roles', () => {
    assert.strictEqual(hasPermission('viewer', 'audit', 'read'), false);
    assert.strictEqual(hasPermission('devops_engineer', 'audit', 'read'), false);
    assert.strictEqual(hasPermission('team_lead', 'audit', 'read'), false);
  });
});
