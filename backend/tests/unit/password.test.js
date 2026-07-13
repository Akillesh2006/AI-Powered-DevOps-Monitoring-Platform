const { test, describe } = require('node:test');
const assert = require('node:assert');
const { hashPassword, comparePassword } = require('../../src/utils/password');

describe('Password Utility Tests', () => {
  test('should successfully hash a password and verify it', async () => {
    const password = 'mySecurePassword123';
    const hash = await hashPassword(password);
    
    assert.ok(hash);
    assert.notStrictEqual(hash, password);
    assert.match(hash, /^\$2[ayb]\$\d{2}\$/); // Confirms it starts with bcrypt hash header (like $2b$12$)
    
    const isMatch = await comparePassword(password, hash);
    assert.strictEqual(isMatch, true);
  });

  test('should fail verification for incorrect password', async () => {
    const password = 'mySecurePassword123';
    const wrongPassword = 'wrongPassword123';
    const hash = await hashPassword(password);
    
    const isMatch = await comparePassword(wrongPassword, hash);
    assert.strictEqual(isMatch, false);
  });

  test('should generate different hashes for the same password (salt uniqueness)', async () => {
    const password = 'samePassword';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    
    assert.notStrictEqual(hash1, hash2);
    
    const verify1 = await comparePassword(password, hash1);
    const verify2 = await comparePassword(password, hash2);
    
    assert.strictEqual(verify1, true);
    assert.strictEqual(verify2, true);
  });

  test('should throw error for password exceeding max length (128 chars)', async () => {
    const longPassword = 'a'.repeat(129);
    await assert.rejects(
      hashPassword(longPassword),
      /Password must not exceed 128 characters/
    );
  });

  test('should return false for validation when comparing a password that is too long', async () => {
    const longPassword = 'a'.repeat(129);
    const mockHash = '$2b$12$12345678901234567890123456789012345678901234567890123';
    const result = await comparePassword(longPassword, mockHash);
    assert.strictEqual(result, false);
  });

  test('should return false for validation when inputs are not strings', async () => {
    assert.strictEqual(await comparePassword(null, 'hash'), false);
    assert.strictEqual(await comparePassword('password', null), false);
  });
});
