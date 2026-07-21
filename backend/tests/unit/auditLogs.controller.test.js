const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

// Mock database store
let mockAuditLogDB = [];
let mockFindQuery = null;

// Mock model implementation
const mockAuditLogModel = {
  schema: { paths: {} },
  find(filter) {
    mockFindQuery = filter;
    
    // Sort array copies to simulate database queries
    let results = mockAuditLogDB.filter(log => log.orgId.toString() === filter.orgId.toString());
    
    const queryChain = {
      _sort: null,
      _skip: null,
      _limit: null,
      sort(sortObj) {
        this._sort = sortObj;
        if (sortObj && sortObj.createdAt === -1) {
          results.sort((a, b) => b.createdAt - a.createdAt);
        }
        return this;
      },
      skip(s) {
        this._skip = s;
        return this;
      },
      limit(l) {
        this._limit = l;
        return this;
      },
      then(resolve, reject) {
        let finalResults = [...results];
        if (this._skip !== null && this._skip !== undefined) {
          finalResults = finalResults.slice(this._skip);
        }
        if (this._limit !== null && this._limit !== undefined) {
          finalResults = finalResults.slice(0, this._limit);
        }
        resolve(finalResults);
      }
    };
    
    queryChain[Symbol.toStringTag] = 'Promise';
    return queryChain;
  },
  
  async countDocuments(filter) {
    return mockAuditLogDB.filter(log => log.orgId.toString() === filter.orgId.toString()).length;
  }
};

// Override mongoose.model
const originalModel = mongoose.model;
mongoose.model = function(name, schema) {
  if (name === 'AuditLog') {
    return mockAuditLogModel;
  }
  return originalModel.call(mongoose, name, schema);
};

// Import controller
const { getAuditLogs } = require('../../src/controllers/auditLogs.controller');

describe('getAuditLogs Controller Unit Tests', () => {
  const orgAId = new mongoose.Types.ObjectId();
  const orgBId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    mockAuditLogDB = [];
    mockFindQuery = null;

    // Seed mock data
    for (let i = 1; i <= 12; i++) {
      mockAuditLogDB.push({
        _id: new mongoose.Types.ObjectId(),
        orgId: orgAId,
        actorUserId: userId,
        action: 'user.invited',
        targetType: 'User',
        targetId: new mongoose.Types.ObjectId(),
        metadata: { invitedRole: 'viewer' },
        createdAt: new Date(Date.now() - i * 1000) // i seconds ago, so i=1 is newest
      });
    }

    // Seed another org's log
    mockAuditLogDB.push({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgBId,
      actorUserId: userId,
      action: 'user.role_changed',
      targetType: 'User',
      targetId: new mongoose.Types.ObjectId(),
      metadata: {},
      createdAt: new Date()
    });
  });

  test('should return all audit logs scoped to caller org, newest-first, with default pagination (page 1, limit 25)', async () => {
    const mockReq = {
      query: {},
      context: { orgId: orgAId, userId, role: 'org_admin' }
    };

    let responseBody = null;
    let statusCode = null;

    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    const mockNext = (err) => {
      assert.fail('next() should not be called: ' + err);
    };

    await getAuditLogs(mockReq, mockRes, mockNext);

    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseBody.success, true);
    assert.strictEqual(responseBody.data.length, 12, 'Default limit of 25 should be applied (12 seeded logs returned)');
    assert.deepStrictEqual(responseBody.meta, {
      page: 1,
      limit: 25,
      total: 12,
      totalPages: 1
    });

    // Check newest first ordering (i=1 is the newest, which is the index 0 element in sorted mock database)
    const log1 = responseBody.data[0];
    const log2 = responseBody.data[1];
    assert.ok(log1.createdAt > log2.createdAt, 'Logs must be ordered newest first');
    
    // Ensure tenant isolation: no Org B log present
    const hasOrgB = responseBody.data.some(log => log.orgId.toString() === orgBId.toString());
    assert.strictEqual(hasOrgB, false, 'Should not return logs from other organizations');
  });

  test('should return the correct paginated slice for page 2 with custom limit', async () => {
    const mockReq = {
      query: { page: '2', limit: '5' },
      context: { orgId: orgAId, userId, role: 'org_admin' }
    };

    let responseBody = null;
    const mockRes = {
      status() { return this; },
      json(data) { responseBody = data; return this; }
    };

    await getAuditLogs(mockReq, mockRes, () => {});

    assert.strictEqual(responseBody.success, true);
    assert.strictEqual(responseBody.data.length, 5);
    assert.deepStrictEqual(responseBody.meta, {
      page: 2,
      limit: 5,
      total: 12,
      totalPages: 3
    });
  });

  test('should return empty array and correct meta for organization with zero audit logs', async () => {
    const newOrgId = new mongoose.Types.ObjectId();
    const mockReq = {
      query: {},
      context: { orgId: newOrgId, userId, role: 'org_admin' }
    };

    let responseBody = null;
    const mockRes = {
      status() { return this; },
      json(data) { responseBody = data; return this; }
    };

    await getAuditLogs(mockReq, mockRes, () => {});

    assert.strictEqual(responseBody.success, true);
    assert.strictEqual(responseBody.data.length, 0);
    assert.deepStrictEqual(responseBody.meta, {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0
    });
  });
});
