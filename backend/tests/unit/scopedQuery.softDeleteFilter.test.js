const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { scopedFind, scopedFindOne } = require('../../src/data/scopedQuery');

describe('scopedQuery softDeleteFilter Unit Tests', () => {
  const contextA = { orgId: 'org_aaaaa', userId: 'usr_1', role: 'org_admin' };

  let mockDB = [];

  class MockModel {
    static queries = [];
    static schema = { paths: { isDeleted: true } };

    static reset() {
      this.queries = [];
    }

    static find(filter, projection, options) {
      this.queries.push({ method: 'find', filter, options });
      
      const results = mockDB.filter(item => {
        return Object.keys(filter).every(key => {
          const filterVal = filter[key];
          const itemVal = item[key];
          
          if (filterVal && typeof filterVal === 'object' && filterVal.$ne !== undefined) {
            return itemVal !== filterVal.$ne;
          }
          if (!itemVal || !filterVal) {
            return itemVal === filterVal;
          }
          return itemVal.toString() === filterVal.toString();
        });
      });

      return results;
    }

    static findOne(filter, projection, options) {
      this.queries.push({ method: 'findOne', filter, options });
      
      const found = mockDB.find(item => {
        return Object.keys(filter).every(key => {
          const filterVal = filter[key];
          const itemVal = item[key];
          
          if (filterVal && typeof filterVal === 'object' && filterVal.$ne !== undefined) {
            return itemVal !== filterVal.$ne;
          }
          if (!itemVal || !filterVal) {
            return itemVal === filterVal;
          }
          return itemVal.toString() === filterVal.toString();
        });
      });

      return found || null;
    }
  }

  beforeEach(() => {
    MockModel.reset();
    mockDB = [
      { _id: 'user_1', orgId: 'org_aaaaa', email: 'user1@org.com', isDeleted: false },
      { _id: 'user_2', orgId: 'org_aaaaa', email: 'user2@org.com', isDeleted: true },
      { _id: 'user_3', orgId: 'org_bbbbb', email: 'user3@org.com', isDeleted: false }
    ];
  });

  test('scopedFind - should exclude document with isDeleted: true by default (no options)', () => {
    const res = scopedFind(MockModel, contextA, {});

    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0]._id, 'user_1');
    assert.deepStrictEqual(MockModel.queries[0].filter, { orgId: 'org_aaaaa', isDeleted: { $ne: true } });
  });

  test('scopedFind - should include document with isDeleted: true when includeDeleted: true is passed', () => {
    const res = scopedFind(MockModel, contextA, {}, { includeDeleted: true });

    assert.strictEqual(res.length, 2);
    const ids = res.map(x => x._id);
    assert.ok(ids.includes('user_1'));
    assert.ok(ids.includes('user_2'));
    assert.deepStrictEqual(MockModel.queries[0].filter, { orgId: 'org_aaaaa' });
  });

  test('scopedFindOne - should exclude document with isDeleted: true by default (no options)', () => {
    const res = scopedFindOne(MockModel, contextA, { _id: 'user_2' });

    assert.strictEqual(res, null);
    assert.deepStrictEqual(MockModel.queries[0].filter, { _id: 'user_2', orgId: 'org_aaaaa', isDeleted: { $ne: true } });
  });

  test('scopedFindOne - should return document with isDeleted: true when includeDeleted: true is passed', () => {
    const res = scopedFindOne(MockModel, contextA, { _id: 'user_2' }, { includeDeleted: true });

    assert.ok(res);
    assert.strictEqual(res._id, 'user_2');
    assert.deepStrictEqual(MockModel.queries[0].filter, { _id: 'user_2', orgId: 'org_aaaaa' });
  });

  test('regression - when all documents have isDeleted: false, default call and includeDeleted: true should yield identical results', () => {
    mockDB = [
      { _id: 'user_1', orgId: 'org_aaaaa', isDeleted: false },
      { _id: 'user_2', orgId: 'org_aaaaa', isDeleted: false }
    ];

    const resultsDefault = scopedFind(MockModel, contextA, {});
    const resultsIncludeDeleted = scopedFind(MockModel, contextA, {}, { includeDeleted: true });

    assert.deepStrictEqual(resultsDefault, resultsIncludeDeleted);
  });
});
