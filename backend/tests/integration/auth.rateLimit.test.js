const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

// Override mongoose.model to resolve mock models (prevent DB errors during app start)
mongoose.model = function() {
  return class MockModel {};
};
mongoose.connect = async () => mongoose;

const app = require('../../src/app');
const { ipStore } = require('../../src/middleware/rateLimiter');

describe('Auth Endpoints Rate Limiting Integration Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(() => {
    // Reset rate limiter IP store before each test to ensure determinism
    for (const key in ipStore) {
      delete ipStore[key];
    }
  });

  test('POST /auth/login rate limiting - allows 5 requests, blocks the 6th with 429 and Retry-After', async () => {
    // Send 5 rapid requests (we can send invalid payloads to trigger fast 400 validation responses, which still increment rate limiter)
    for (let i = 1; i <= 5; i++) {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.strictEqual(response.status, 400, `Request ${i} should return 400 Validation Error`);
    }

    // The 6th request must trigger a 429 Rate Limit error
    const blockedResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    assert.strictEqual(blockedResponse.status, 429);
    assert.ok(blockedResponse.headers.has('Retry-After'));
    
    const retryAfter = blockedResponse.headers.get('Retry-After');
    assert.ok(parseInt(retryAfter, 10) > 0);

    const body = await blockedResponse.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'RATE_LIMIT_EXCEEDED');
    assert.ok(body.error.message.includes('Too many login attempts'));
  });

  test('POST /auth/register rate limiting - allows 3 requests, blocks the 4th with 429', async () => {
    // Send 3 rapid requests
    for (let i = 1; i <= 3; i++) {
      const response = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.strictEqual(response.status, 400, `Request ${i} should return 400 Validation Error`);
    }

    // The 4th request must trigger a 429 Rate Limit error
    const blockedResponse = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    assert.strictEqual(blockedResponse.status, 429);
    assert.ok(blockedResponse.headers.has('Retry-After'));

    const body = await blockedResponse.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'RATE_LIMIT_EXCEEDED');
    assert.ok(body.error.message.includes('Too many registration attempts'));
  });
});
