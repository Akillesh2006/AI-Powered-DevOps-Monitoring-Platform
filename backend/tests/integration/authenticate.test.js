const { test, describe } = require('node:test');
const assert = require('node:assert');
const authenticate = require('../../src/middleware/authenticate');
const { generateAccessToken } = require('../../src/utils/jwt');

describe('Authentication Middleware Integration Tests', () => {
  const mockUser = {
    userId: 'usr_12345',
    orgId: 'org_abcde',
    role: 'devops_engineer'
  };

  test('should succeed with a valid Bearer token and populate req.context', () => {
    const token = generateAccessToken(mockUser);
    const req = {
      headers: {
        authorization: `Bearer ${token}`
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

    authenticate(req, res, next);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(statusSet, null);
    assert.strictEqual(jsonSent, null);
    assert.deepEqual(req.context, {
      userId: mockUser.userId,
      orgId: mockUser.orgId,
      role: mockUser.role
    });
  });

  test('should reject requests with missing Authorization header', () => {
    const req = {
      headers: {}
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

    authenticate(req, res, next);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSet, 401);
    assert.deepEqual(jsonSent, {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token is required',
        details: []
      }
    });
  });

  test('should reject requests with malformed Authorization header (no Bearer prefix)', () => {
    const req = {
      headers: {
        authorization: 'InvalidPrefix token_value'
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

    authenticate(req, res, next);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSet, 401);
    assert.deepEqual(jsonSent, {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authorization header format must be Bearer <token>',
        details: []
      }
    });
  });

  test('should reject requests with an expired access token', async () => {
    // Generate token with 1-second expiry and wait for it to expire
    const expiredToken = generateAccessToken(mockUser, '1s');
    
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const req = {
      headers: {
        authorization: `Bearer ${expiredToken}`
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

    authenticate(req, res, next);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSet, 401);
    assert.deepEqual(jsonSent, {
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired',
        details: []
      }
    });
  });

  test('should reject requests with a tampered token signature', () => {
    const validToken = generateAccessToken(mockUser);
    const parts = validToken.split('.');
    // Alter the signature
    const tamperedSignature = parts[2].substring(0, parts[2].length - 1) + (parts[2].endsWith('a') ? 'b' : 'a');
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

    const req = {
      headers: {
        authorization: `Bearer ${tamperedToken}`
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

    authenticate(req, res, next);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusSet, 401);
    assert.deepEqual(jsonSent, {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or tampered token',
        details: []
      }
    });
  });
});
