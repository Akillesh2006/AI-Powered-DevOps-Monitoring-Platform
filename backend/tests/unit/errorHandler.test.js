const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const ApiError = require('../../src/utils/apiError');
const errorHandler = require('../../src/middleware/errorHandler');

describe('errorHandler Middleware Unit Tests', () => {
  let originalConsoleError;
  let consoleErrorCalls = [];

  before(() => {
    // Stub console.error to keep test output clean and capture arguments for assertions
    originalConsoleError = console.error;
    console.error = (...args) => {
      consoleErrorCalls.push(args);
    };
  });

  after(() => {
    // Restore original console.error after all tests in this suite run
    console.error = originalConsoleError;
  });

  test('should handle ApiError correctly and return structured API error response', () => {
    const apiError = new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', ['y']);
    
    let statusCalledWith = null;
    let jsonCalledWith = null;

    const req = {};
    const res = {
      status(code) {
        statusCalledWith = code;
        return this;
      },
      json(body) {
        jsonCalledWith = body;
        return this;
      }
    };
    const next = () => {};

    errorHandler(apiError, req, res, next);

    assert.strictEqual(statusCalledWith, 422);
    assert.deepStrictEqual(jsonCalledWith, {
      success: false,
      data: null,
      meta: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: ['y']
      }
    });
  });

  test('should fallback to 500 INTERNAL_ERROR and hide internal details for non-ApiError', () => {
    consoleErrorCalls = [];
    const plainError = new Error('boom');

    let statusCalledWith = null;
    let jsonCalledWith = null;

    const req = {};
    const res = {
      status(code) {
        statusCalledWith = code;
        return this;
      },
      json(body) {
        jsonCalledWith = body;
        return this;
      }
    };
    const next = () => {};

    errorHandler(plainError, req, res, next);

    assert.strictEqual(statusCalledWith, 500);
    assert.strictEqual(jsonCalledWith.success, false);
    assert.strictEqual(jsonCalledWith.data, null);
    assert.strictEqual(jsonCalledWith.meta, null);
    assert.strictEqual(jsonCalledWith.error.code, 'INTERNAL_ERROR');
    // Ensure the actual error message 'boom' is NOT in the response
    assert.notStrictEqual(jsonCalledWith.error.message, 'boom');
    assert.strictEqual(typeof jsonCalledWith.error.message, 'string');
    assert.deepStrictEqual(jsonCalledWith.error.details, []);

    // Ensure the real error was logged to the console
    assert.strictEqual(consoleErrorCalls.length, 1);
    assert.strictEqual(consoleErrorCalls[0][0], plainError);
  });
});
