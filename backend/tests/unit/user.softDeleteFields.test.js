const { test, describe } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const User = require('../../src/models/User');

describe('User Schema Soft Delete Fields Unit Tests', () => {
  test('should default isDeleted to false and deletedAt to null for a new User instance', () => {
    const user = new User({
      email: 'test@org.com',
      passwordHash: 'dummyhash',
      role: 'viewer'
    });

    assert.strictEqual(user.isDeleted, false);
    assert.strictEqual(user.deletedAt, null);
  });

  test('should allow setting isDeleted and deletedAt explicitly', () => {
    const testDate = new Date();
    const user = new User({
      email: 'deleted-user@org.com',
      passwordHash: 'dummyhash',
      role: 'viewer',
      isDeleted: true,
      deletedAt: testDate
    });

    assert.strictEqual(user.isDeleted, true);
    assert.deepStrictEqual(user.deletedAt, testDate);
  });
});
