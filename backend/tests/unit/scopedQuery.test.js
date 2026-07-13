const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  scopedFind,
  scopedFindOne,
  scopedCreate,
  scopedUpdateOne,
  scopedUpdateMany,
  scopedDeleteOne,
  scopedDeleteMany
} = require('../../src/data/scopedQuery');

describe('Scoped Query Data Access Wrapper Tests', () => {
  const contextA = { orgId: 'org_aaaaa', userId: 'usr_1', role: 'devops_engineer' };
  const contextB = { orgId: 'org_bbbbb', userId: 'usr_2', role: 'viewer' };

  // Define a Mock Model class to spy on the queries
  class MockModel {
    static queries = [];
    static updates = [];
    static deletes = [];
    static instancesCreated = [];

    static reset() {
      this.queries = [];
      this.updates = [];
      this.deletes = [];
      this.instancesCreated = [];
    }

    constructor(data) {
      this.data = data;
      MockModel.instancesCreated.push(data);
      this.save = async function() {
        return this;
      };
    }

    static find(filter, projection, options) {
      this.queries.push({ method: 'find', filter, options });
      return this;
    }

    static findOne(filter, projection, options) {
      this.queries.push({ method: 'findOne', filter, options });
      return this;
    }

    static updateOne(filter, update, options) {
      this.updates.push({ method: 'updateOne', filter, update, options });
      return { matchedCount: 1 };
    }

    static updateMany(filter, update, options) {
      this.updates.push({ method: 'updateMany', filter, update, options });
      return { matchedCount: 2 };
    }

    static deleteOne(filter) {
      this.deletes.push({ method: 'deleteOne', filter });
      return { deletedCount: 1 };
    }

    static deleteMany(filter) {
      this.deletes.push({ method: 'deleteMany', filter });
      return { deletedCount: 2 };
    }
  }

  beforeEach(() => {
    MockModel.reset();
  });

  test('should inject the correct context.orgId on scopedFind', () => {
    scopedFind(MockModel, contextA, { status: 'active' });

    assert.strictEqual(MockModel.queries.length, 1);
    assert.deepEqual(MockModel.queries[0].filter, {
      status: 'active',
      orgId: 'org_aaaaa'
    });
  });

  test('should override any caller-supplied orgId on scopedFind', () => {
    // Malicious caller tries to inject orgId of Org B under Org A's context
    scopedFind(MockModel, contextA, { status: 'active', orgId: 'org_bbbbb' });

    assert.strictEqual(MockModel.queries.length, 1);
    assert.deepEqual(MockModel.queries[0].filter, {
      status: 'active',
      orgId: 'org_aaaaa' // Org A context wins
    });
  });

  test('should inject and override orgId on scopedFindOne', () => {
    scopedFindOne(MockModel, contextB, { _id: 'some_id', orgId: 'org_aaaaa' });

    assert.strictEqual(MockModel.queries.length, 1);
    assert.deepEqual(MockModel.queries[0].filter, {
      _id: 'some_id',
      orgId: 'org_bbbbb' // Org B context wins
    });
  });

  test('should override orgId when creating documents via scopedCreate', async () => {
    const data = { name: 'Prod Server', hostAddress: '10.0.0.1', orgId: 'org_bbbbb' };
    await scopedCreate(MockModel, contextA, data);

    assert.strictEqual(MockModel.instancesCreated.length, 1);
    assert.deepEqual(MockModel.instancesCreated[0], {
      name: 'Prod Server',
      hostAddress: '10.0.0.1',
      orgId: 'org_aaaaa' // Org A context wins
    });
  });

  test('should inject and override orgId on updates and strip orgId updates from update payload', async () => {
    const filter = { _id: 'server_1', orgId: 'org_bbbbb' };
    const update = { $set: { status: 'degraded', orgId: 'org_bbbbb' } };

    await scopedUpdateOne(MockModel, contextA, filter, update);

    assert.strictEqual(MockModel.updates.length, 1);
    // Verifies orgId was overridden in query filter
    assert.strictEqual(MockModel.updates[0].filter.orgId, 'org_aaaaa');
    // Verifies orgId was stripped from the $set payload to prevent tenant-hopping updates
    assert.deepEqual(MockModel.updates[0].update, { $set: { status: 'degraded' } });
  });

  test('should inject and override orgId on updateMany', async () => {
    const filter = { type: 'api', orgId: 'org_bbbbb' };
    const update = { $set: { interval: 60 } };

    await scopedUpdateMany(MockModel, contextA, filter, update);

    assert.strictEqual(MockModel.updates.length, 1);
    assert.strictEqual(MockModel.updates[0].method, 'updateMany');
    assert.strictEqual(MockModel.updates[0].filter.orgId, 'org_aaaaa');
  });

  test('should inject and override orgId on scopedDeleteOne and scopedDeleteMany', async () => {
    const filter = { _id: 'api_1', orgId: 'org_bbbbb' };

    await scopedDeleteOne(MockModel, contextA, filter);
    await scopedDeleteMany(MockModel, contextB, filter);

    assert.strictEqual(MockModel.deletes.length, 2);
    assert.strictEqual(MockModel.deletes[0].method, 'deleteOne');
    assert.strictEqual(MockModel.deletes[0].filter.orgId, 'org_aaaaa');

    assert.strictEqual(MockModel.deletes[1].method, 'deleteMany');
    assert.strictEqual(MockModel.deletes[1].filter.orgId, 'org_bbbbb');
  });

  test('should throw an error if context is missing or orgId is undefined', () => {
    assert.throws(() => {
      scopedFind(MockModel, null, {});
    }, /Tenant context \(orgId\) is required/);

    assert.throws(() => {
      scopedFind(MockModel, {}, {});
    }, /Tenant context \(orgId\) is required/);
  });
});
