const { test, describe } = require('node:test');
const assert = require('node:assert');
const { body: schema } = require('../../src/validators/organizations.validators');

describe('organizations.validators Unit Tests', () => {
  test('should accept valid payloads with name only', () => {
    const payload = { name: 'Acme Corp' };
    const { error, value } = schema.validate(payload);
    assert.strictEqual(error, undefined);
    assert.strictEqual(value.name, 'Acme Corp');
  });

  test('should accept valid payloads with notificationDefaults only', () => {
    const payload = {
      notificationDefaults: {
        alertEmailRecipients: ['ops@acme.com', 'admin@acme.com']
      }
    };
    const { error } = schema.validate(payload);
    assert.strictEqual(error, undefined);
  });

  test('should accept valid payloads with both name and notificationDefaults', () => {
    const payload = {
      name: 'Acme Corp',
      notificationDefaults: {
        alertEmailRecipients: ['ops@acme.com']
      }
    };
    const { error } = schema.validate(payload);
    assert.strictEqual(error, undefined);
  });

  test('should reject name under 2 characters', () => {
    const payload = { name: 'A' };
    const { error } = schema.validate(payload);
    assert.ok(error);
    assert.ok(error.message.includes('"name" length must be at least 2 characters long'));
  });

  test('should reject name over 100 characters', () => {
    const payload = { name: 'A'.repeat(101) };
    const { error } = schema.validate(payload);
    assert.ok(error);
  });

  test('should reject empty/whitespace name', () => {
    const payload = { name: '   ' };
    const { error } = schema.validate(payload);
    assert.ok(error);
  });

  test('should reject if notificationDefaults is not an object', () => {
    const payload = { notificationDefaults: 'not-an-object' };
    const { error } = schema.validate(payload);
    assert.ok(error);
  });

  test('should reject if alertEmailRecipients is missing when notificationDefaults is present', () => {
    const payload = { notificationDefaults: {} };
    const { error } = schema.validate(payload);
    assert.ok(error);
  });

  test('should reject if alertEmailRecipients is not an array', () => {
    const payload = {
      notificationDefaults: {
        alertEmailRecipients: 'ops@acme.com'
      }
    };
    const { error } = schema.validate(payload);
    assert.ok(error);
  });

  test('should reject if alertEmailRecipients contains invalid email format', () => {
    const payload = {
      notificationDefaults: {
        alertEmailRecipients: ['ops@acme.com', 'invalid-email']
      }
    };
    const { error } = schema.validate(payload);
    assert.ok(error);
  });
});
