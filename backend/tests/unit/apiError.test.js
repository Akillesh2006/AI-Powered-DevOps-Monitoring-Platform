const { test, describe } = require('node:test');
const assert = require('node:assert');
const ApiError = require('../../src/utils/apiError');

describe('ApiError Unit Tests', () => {
  test('should correctly instantiate ApiError with all fields', () => {
    const statusCode = 404;
    const code = 'RESOURCE_NOT_FOUND';
    const message = 'The requested resource was not found';
    const details = ['detail1', 'detail2'];

    const err = new ApiError(statusCode, code, message, details);

    assert.ok(err instanceof Error);
    assert.ok(err instanceof ApiError);
    assert.strictEqual(err.statusCode, statusCode);
    assert.strictEqual(err.code, code);
    assert.strictEqual(err.message, message);
    assert.deepStrictEqual(err.details, details);
    assert.strictEqual(err.name, 'ApiError');
    assert.ok(err.stack);
  });

  test('should default details to an empty array if not provided', () => {
    const statusCode = 500;
    const code = 'INTERNAL_ERROR';
    const message = 'An unexpected error occurred';

    const err = new ApiError(statusCode, code, message);

    assert.ok(err instanceof Error);
    assert.ok(err instanceof ApiError);
    assert.strictEqual(err.statusCode, statusCode);
    assert.strictEqual(err.code, code);
    assert.strictEqual(err.message, message);
    assert.deepStrictEqual(err.details, []);
    assert.strictEqual(err.name, 'ApiError');
    assert.ok(err.stack);
  });
});
