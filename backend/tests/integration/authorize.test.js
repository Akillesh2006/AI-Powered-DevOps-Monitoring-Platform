const { test, describe } = require('node:test');
const assert = require('node:assert');
const authorize = require('../../src/middleware/authorize');
const { permissions } = require('../../src/config/permissions');

describe('RBAC Authorization Middleware Integration Tests', () => {
  const roles = Object.keys(permissions);

  // We dynamically generate tests for every role against a cross-section of resources and actions
  roles.forEach((role) => {
    describe(`Role-matrix tests for: ${role}`, () => {
      const testCases = [
        { resource: 'organization', action: 'read' },
        { resource: 'organization', action: 'update' },
        { resource: 'organization', action: 'delete' },
        { resource: 'organization', action: 'list_platform' },
        { resource: 'users', action: 'invite' },
        { resource: 'users', action: 'list' },
        { resource: 'users', action: 'read_self' },
        { resource: 'users', action: 'suspend_admin' },
        { resource: 'servers', action: 'create' },
        { resource: 'servers', action: 'read' },
        { resource: 'api_monitors', action: 'delete' },
        { resource: 'alerts', action: 'acknowledge' },
        { resource: 'reports', action: 'export_metrics' }
      ];

      testCases.forEach(({ resource, action }) => {
        // Query the config directly to decide expected behavior
        const allowedActions = permissions[role][resource];
        const expectedAllow = allowedActions && allowedActions.includes(action);

        test(`should ${expectedAllow ? 'ALLOW' : 'DENY'} action '${action}' on resource '${resource}'`, () => {
          const req = {
            context: {
              role
            }
          };

          let statusSet = null;
          let jsonSent = null;
          const res = {
            status(code) {
              statusSet = code;
              return this;
            },
            json(data) {
              jsonSent = data;
              return this;
            }
          };

          let nextCalled = false;
          const next = () => {
            nextCalled = true;
          };

          const middleware = authorize(resource, action);
          middleware(req, res, next);

          if (expectedAllow) {
            assert.strictEqual(nextCalled, true, `Role '${role}' was expected to be allowed to '${action}' '${resource}' but was denied`);
            assert.strictEqual(statusSet, null);
            assert.strictEqual(jsonSent, null);
          } else {
            assert.strictEqual(nextCalled, false, `Role '${role}' was expected to be denied to '${action}' '${resource}' but was allowed`);
            assert.strictEqual(statusSet, 403);
            assert.deepEqual(jsonSent, {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: `Access denied: Role '${role}' is not authorized to perform '${action}' on '${resource}'`,
                details: []
              }
            });
          }
        });
      });
    });
  });

  test('should default-deny if req.context is missing', () => {
    const req = {};
    let statusSet = null;
    let jsonSent = null;
    const res = {
      status(code) {
        statusSet = code;
        return this;
      },
      json(data) {
        jsonSent = data;
        return this;
      }
    };

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const middleware = authorize('servers', 'read');
    middleware(req, res, next);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSet, 403);
    assert.deepEqual(jsonSent, {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied: Authentication context is missing',
        details: []
      }
    });
  });

  test('should default-deny if req.context.role is missing', () => {
    const req = {
      context: {}
    };
    let statusSet = null;
    let jsonSent = null;
    const res = {
      status(code) {
        statusSet = code;
        return this;
      },
      json(data) {
        jsonSent = data;
        return this;
      }
    };

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const middleware = authorize('servers', 'read');
    middleware(req, res, next);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSet, 403);
    assert.deepEqual(jsonSent, {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied: Authentication context is missing',
        details: []
      }
    });
  });
});
