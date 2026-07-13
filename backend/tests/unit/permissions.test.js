const { test, describe } = require('node:test');
const assert = require('node:assert');
const { hasPermission } = require('../../src/config/permissions');

describe('RBAC Permission Configuration Tests', () => {
  // Spot checks from User Roles & Permission Matrix Document
  
  test('Viewer permissions: read-only access, default-deny on modifications', () => {
    // Viewer should have read-only access to monitoring data
    assert.strictEqual(hasPermission('viewer', 'organization', 'read'), true);
    assert.strictEqual(hasPermission('viewer', 'servers', 'read'), true);
    assert.strictEqual(hasPermission('viewer', 'api_monitors', 'read'), true);
    assert.strictEqual(hasPermission('viewer', 'ai_insights', 'read'), true);
    assert.strictEqual(hasPermission('viewer', 'alerts', 'read'), true);
    assert.strictEqual(hasPermission('viewer', 'dashboards', 'read_org'), true);
    assert.strictEqual(hasPermission('viewer', 'reports', 'export_metrics'), true);

    // Viewer should be denied write/delete/config actions
    assert.strictEqual(hasPermission('viewer', 'organization', 'update'), false);
    assert.strictEqual(hasPermission('viewer', 'users', 'invite'), false);
    assert.strictEqual(hasPermission('viewer', 'servers', 'create'), false);
    assert.strictEqual(hasPermission('viewer', 'api_monitors', 'delete'), false);
    assert.strictEqual(hasPermission('viewer', 'alerts', 'acknowledge'), false);
  });

  test('Org Admin permissions: full organizational control, denied platform actions', () => {
    // Org Admin can manage resources, users, and org settings
    assert.strictEqual(hasPermission('org_admin', 'organization', 'update'), true);
    assert.strictEqual(hasPermission('org_admin', 'users', 'invite'), true);
    assert.strictEqual(hasPermission('org_admin', 'servers', 'create'), true);
    assert.strictEqual(hasPermission('org_admin', 'api_monitors', 'delete'), true);
    assert.strictEqual(hasPermission('org_admin', 'alerts', 'acknowledge'), true);
    assert.strictEqual(hasPermission('org_admin', 'alerts', 'delete'), true);

    // Org Admin should be denied platform-level actions
    assert.strictEqual(hasPermission('org_admin', 'organization', 'list_platform'), false);
    assert.strictEqual(hasPermission('org_admin', 'organization', 'delete'), false);
    assert.strictEqual(hasPermission('org_admin', 'users', 'suspend_admin'), false);
  });

  test('Devops Engineer permissions: resource control, denied user/org admin features', () => {
    // DevOps can manage servers, API monitors, alerts rules
    assert.strictEqual(hasPermission('devops_engineer', 'servers', 'create'), true);
    assert.strictEqual(hasPermission('devops_engineer', 'api_monitors', 'update'), true);
    assert.strictEqual(hasPermission('devops_engineer', 'alerts', 'acknowledge'), true);
    assert.strictEqual(hasPermission('devops_engineer', 'alerts', 'create_rule'), true);

    // DevOps cannot manage users or org profiles
    assert.strictEqual(hasPermission('devops_engineer', 'users', 'invite'), false);
    assert.strictEqual(hasPermission('devops_engineer', 'organization', 'update'), false);
  });

  test('Team Lead permissions: operational oversight, denied configuration capabilities', () => {
    // Team Lead can acknowledge/resolve alerts, export data, review anomalies
    assert.strictEqual(hasPermission('team_lead', 'alerts', 'acknowledge'), true);
    assert.strictEqual(hasPermission('team_lead', 'alerts', 'resolve'), true);
    assert.strictEqual(hasPermission('team_lead', 'ai_insights', 'review'), true);
    assert.strictEqual(hasPermission('team_lead', 'reports', 'export_metrics'), true);

    // Team Lead cannot configure resources or rules
    assert.strictEqual(hasPermission('team_lead', 'servers', 'create'), false);
    assert.strictEqual(hasPermission('team_lead', 'alerts', 'create_rule'), false);
    assert.strictEqual(hasPermission('team_lead', 'users', 'invite'), false);
  });

  test('Super Admin permissions: strictly platform-level actions, no org-scoped operations', () => {
    // Super Admin can list platforms, suspend accounts, and delete orgs
    assert.strictEqual(hasPermission('super_admin', 'organization', 'list_platform'), true);
    assert.strictEqual(hasPermission('super_admin', 'organization', 'delete'), true);
    assert.strictEqual(hasPermission('super_admin', 'users', 'suspend_admin'), true);

    // Super Admin cannot access tenant-level operational data
    assert.strictEqual(hasPermission('super_admin', 'servers', 'read'), false);
    assert.strictEqual(hasPermission('super_admin', 'api_monitors', 'read'), false);
    assert.strictEqual(hasPermission('super_admin', 'alerts', 'read'), false);
    assert.strictEqual(hasPermission('super_admin', 'ai_insights', 'read'), false);
    assert.strictEqual(hasPermission('super_admin', 'reports', 'export_metrics'), false);
  });

  test('Strict default-deny logic for undefined/malformed parameters', () => {
    assert.strictEqual(hasPermission(null, 'servers', 'read'), false);
    assert.strictEqual(hasPermission('viewer', null, 'read'), false);
    assert.strictEqual(hasPermission('viewer', 'servers', null), false);
    assert.strictEqual(hasPermission('unknown_role', 'servers', 'read'), false);
    assert.strictEqual(hasPermission('viewer', 'unknown_resource', 'read'), false);
    assert.strictEqual(hasPermission('viewer', 'servers', 'unknown_action'), false);
  });
});
