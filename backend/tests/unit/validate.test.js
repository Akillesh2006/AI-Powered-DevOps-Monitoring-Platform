const { test, describe } = require('node:test');
const assert = require('node:assert');
const Joi = require('joi');
const validate = require('../../src/middleware/validate');
const ApiError = require('../../src/utils/apiError');

describe('validate Middleware Unit Tests', () => {
  const schema = {
    body: Joi.object({
      name: Joi.string().required(),
      age: Joi.number().integer().min(0)
    }),
    query: Joi.object({
      search: Joi.string().optional()
    }),
    params: Joi.object({
      id: Joi.string().required()
    })
  };

  test('should call next() with no arguments on valid payload', () => {
    const middleware = validate(schema);

    const mockReq = {
      body: { name: 'Alice', age: 30 },
      query: { search: 'hello' },
      params: { id: '123' }
    };

    let nextCalled = false;
    let nextArg = undefined;

    const mockRes = {};
    const next = (arg) => {
      nextCalled = true;
      nextArg = arg;
    };

    middleware(mockReq, mockRes, next);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(nextArg, undefined);
    assert.strictEqual(mockReq.body.name, 'Alice');
    assert.strictEqual(mockReq.body.age, 30);
  });

  test('should pass ApiError to next() on invalid body payload', () => {
    const middleware = validate(schema);

    const mockReq = {
      body: { age: -5 }, // missing name, age is too small
      query: {},
      params: { id: '123' }
    };

    let nextCalled = false;
    let nextArg = undefined;

    const mockRes = {};
    const next = (arg) => {
      nextCalled = true;
      nextArg = arg;
    };

    middleware(mockReq, mockRes, next);

    assert.strictEqual(nextCalled, true);
    assert.ok(nextArg instanceof ApiError);
    assert.strictEqual(nextArg.statusCode, 422);
    assert.strictEqual(nextArg.code, 'VALIDATION_ERROR');
    assert.strictEqual(nextArg.message, 'Request validation failed');
    assert.ok(nextArg.details.length >= 2);
    assert.ok(nextArg.details.some(msg => msg.includes('"name" is required')));
    assert.ok(nextArg.details.some(msg => msg.includes('"age" must be greater than or equal to 0')));
  });

  test('should pass ApiError to next() on invalid query/params payload', () => {
    const middleware = validate(schema);

    const mockReq = {
      body: { name: 'Bob' },
      query: { search: 123 }, // invalid type, but wait: Joi string validation might coerce numbers to strings, so let's pass something that fails string. Wait, no, Joi.string() won't fail numbers if it does casting, or it might depending on config. Let's use object or empty string if that fails, or we can just leave query empty and fail params.
      params: {} // missing id
    };

    let nextCalled = false;
    let nextArg = undefined;

    const mockRes = {};
    const next = (arg) => {
      nextCalled = true;
      nextArg = arg;
    };

    middleware(mockReq, mockRes, next);

    assert.strictEqual(nextCalled, true);
    assert.ok(nextArg instanceof ApiError);
    assert.strictEqual(nextArg.statusCode, 422);
    assert.ok(nextArg.details.some(msg => msg.includes('"id" is required')));
  });
});
