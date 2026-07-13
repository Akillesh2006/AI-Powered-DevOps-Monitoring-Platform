const { test, describe } = require('node:test');
const assert = require('node:assert');
const { generateAccessToken, verifyAccessToken } = require('../../src/utils/jwt');

describe('JWT Access Token Utility Tests', () => {
  const mockUser = {
    userId: 'usr_12345',
    orgId: 'org_abcde',
    role: 'devops_engineer'
  };

  test('should generate a valid access token with correct claims and 15-minute expiry', () => {
    const token = generateAccessToken(mockUser);
    assert.ok(token);

    // Verify token structure (header.payload.signature)
    const parts = token.split('.');
    assert.strictEqual(parts.length, 3);

    // Decode and verify claims
    const decoded = verifyAccessToken(token);
    assert.strictEqual(decoded.sub, mockUser.userId);
    assert.strictEqual(decoded.orgId, mockUser.orgId);
    assert.strictEqual(decoded.role, mockUser.role);
    assert.ok(decoded.iat);
    assert.ok(decoded.exp);

    // Verify 15-minute expiry (900 seconds)
    const duration = decoded.exp - decoded.iat;
    assert.strictEqual(duration, 15 * 60);
  });

  test('should generate access token with null orgId for super_admin', () => {
    const superAdmin = {
      userId: 'usr_super',
      orgId: null,
      role: 'super_admin'
    };

    const token = generateAccessToken(superAdmin);
    const decoded = verifyAccessToken(token);
    assert.strictEqual(decoded.sub, superAdmin.userId);
    assert.strictEqual(decoded.orgId, null);
    assert.strictEqual(decoded.role, superAdmin.role);
  });

  test('should reject verification if token is tampered with', () => {
    const token = generateAccessToken(mockUser);
    
    // Alter the signature (last part of the JWT)
    const parts = token.split('.');
    const tamperedSignature = parts[2].substring(0, parts[2].length - 1) + (parts[2].endsWith('a') ? 'b' : 'a');
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

    assert.throws(
      () => verifyAccessToken(tamperedToken),
      /invalid signature|jwt malformed/
    );
  });

  test('should fail verification when token is expired', async () => {
    // Generate a token with a 1-second custom expiry
    const token = generateAccessToken(mockUser, '1s');
    
    // Verify immediately (should succeed)
    const decoded = verifyAccessToken(token);
    assert.ok(decoded);

    // Wait 1.5 seconds for expiry
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify again (should fail with TokenExpiredError)
    assert.throws(
      () => verifyAccessToken(token),
      (err) => {
        return err.name === 'TokenExpiredError' && err.message.includes('jwt expired');
      }
    );
  });

  test('should validate environment secret configuration behavior in production mode', () => {
    // Save original env values
    const originalSecret = process.env.JWT_SECRET;
    const originalEnv = process.env.NODE_ENV;

    try {
      // Set to production and clear secret
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'production';

      // Re-requiring should throw error when process.env.NODE_ENV is production and secret is missing
      assert.throws(() => {
        // Clear require cache for the module
        delete require.cache[require.resolve('../../src/utils/jwt')];
        require('../../src/utils/jwt');
      }, /JWT_SECRET environment variable is required in production/);

    } finally {
      // Restore original environment values
      if (originalSecret) {
        process.env.JWT_SECRET = originalSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
      process.env.NODE_ENV = originalEnv;
      // Reload clean cache
      delete require.cache[require.resolve('../../src/utils/jwt')];
    }
  });
});
