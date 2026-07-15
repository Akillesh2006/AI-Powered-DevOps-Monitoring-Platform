const { test, describe } = require('node:test');
const assert = require('node:assert');
const { success } = require('../../src/utils/apiResponse');

describe('apiResponse Unit Tests', () => {
  test('should return standardized success response envelope', () => {
    let statusSet = null;
    let jsonSent = null;
    const mockRes = {
      status(code) {
        statusSet = code;
        return this;
      },
      json(data) {
        jsonSent = data;
        return this;
      }
    };

    const data = { id: 1 };
    success(mockRes, data, null, 200);

    assert.strictEqual(statusSet, 200);
    assert.deepStrictEqual(jsonSent, {
      success: true,
      data: { id: 1 },
      meta: null,
      error: null
    });
  });

  test('should verify output shape matches getMyOrganization for equivalent payload', () => {
    let statusSet = null;
    let jsonSent = null;
    const mockRes = {
      status(code) {
        statusSet = code;
        return this;
      },
      json(data) {
        jsonSent = data;
        return this;
      }
    };

    // A mock organization document representation
    const org = {
      _id: { toString: () => '64b1234567890123456789ab' },
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'free',
      notificationDefaults: { alertEmailRecipients: ['ops@acme.com'] },
      createdAt: new Date('2026-07-15T00:00:00.000Z')
    };

    // Payload currently hand-written in getMyOrganization
    const handWrittenPayload = {
      success: true,
      data: {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        notificationDefaults: org.notificationDefaults,
        createdAt: org.createdAt
      }
    };

    // Call success helper with the equivalent payload data
    success(mockRes, handWrittenPayload.data, null, 200);

    // Assert status is 200
    assert.strictEqual(statusSet, 200);

    // Verify key fields match the getMyOrganization hand-written shape
    assert.strictEqual(jsonSent.success, handWrittenPayload.success);
    assert.deepStrictEqual(jsonSent.data, handWrittenPayload.data);

    // Verify full envelope contains the new unified keys
    assert.deepStrictEqual(jsonSent, {
      success: true,
      data: handWrittenPayload.data,
      meta: null,
      error: null
    });
  });
});
