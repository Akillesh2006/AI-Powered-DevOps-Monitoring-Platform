const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { scopedSoftDeleteOne } = require('../../src/data/scopedQuery');

describe('scopedSoftDeleteOne Unit Tests', () => {
  const contextA = { orgId: 'org_aaaaa', userId: 'usr_1', role: 'org_admin' };
  const contextB = { orgId: 'org_bbbbb', userId: 'usr_2', role: 'org_admin' };

  let mockDB = [];

  class MockModel {
    static updates = [];

    static reset() {
      this.updates = [];
    }

    static async updateOne(filter, update, options) {
      this.updates.push({ filter, update, options });

      const doc = mockDB.find(item => {
        return Object.keys(filter).every(key => {
          if (!item[key] || !filter[key]) return false;
          return item[key].toString() === filter[key].toString();
        });
      });

      if (doc) {
        if (update.$set) {
          Object.assign(doc, update.$set);
        }
        return { matchedCount: 1, modifiedCount: 1 };
      }

      return { matchedCount: 0, modifiedCount: 0 };
    }
  }

  beforeEach(() => {
    MockModel.reset();
    mockDB = [
      { _id: 'user_1', orgId: 'org_aaaaa', email: 'user1@org.com', isDeleted: false, deletedAt: null },
      { _id: 'user_2', orgId: 'org_aaaaa', email: 'user2@org.com', isDeleted: false, deletedAt: null },
      { _id: 'user_3', orgId: 'org_bbbbb', email: 'user3@org.com', isDeleted: false, deletedAt: null }
    ];
  });

  test('should successfully soft-delete (set isDeleted/deletedAt) a matching same-org document without removing it', async () => {
    const result = await scopedSoftDeleteOne(MockModel, contextA, { _id: 'user_1' });

    assert.strictEqual(result.matchedCount, 1);
    assert.strictEqual(result.modifiedCount, 1);

    assert.strictEqual(MockModel.updates.length, 1);
    assert.deepStrictEqual(MockModel.updates[0].filter, { _id: 'user_1', orgId: 'org_aaaaa' });
    assert.strictEqual(MockModel.updates[0].update.$set.isDeleted, true);
    assert.ok(MockModel.updates[0].update.$set.deletedAt instanceof Date);

    const doc1 = mockDB.find(x => x._id === 'user_1');
    assert.ok(doc1);
    assert.strictEqual(doc1.isDeleted, true);
    assert.ok(doc1.deletedAt instanceof Date);
  });

  test('should respect org-scoping and not affect a different-org document (tenant isolation)', async () => {
    const result = await scopedSoftDeleteOne(MockModel, contextA, { _id: 'user_3' });

    assert.strictEqual(result.matchedCount, 0);
    assert.strictEqual(result.modifiedCount, 0);

    assert.strictEqual(MockModel.updates.length, 1);
    assert.deepStrictEqual(MockModel.updates[0].filter, { _id: 'user_3', orgId: 'org_aaaaa' });

    const doc3 = mockDB.find(x => x._id === 'user_3');
    assert.ok(doc3);
    assert.strictEqual(doc3.isDeleted, false);
    assert.strictEqual(doc3.deletedAt, null);
  });

  test('should return no-match shape (matchedCount: 0) for nonexistent id', async () => {
    const result = await scopedSoftDeleteOne(MockModel, contextA, { _id: 'nonexistent' });

    assert.strictEqual(result.matchedCount, 0);
    assert.strictEqual(result.modifiedCount, 0);
  });
});
