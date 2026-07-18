const { test, describe } = require('node:test');
const assert = require('node:assert');
const { parseListParams } = require('../../src/utils/queryHelpers');

describe('parseListParams Unit Tests', () => {
  test('should return default pagination, empty filter, and null search when no parameters are provided', () => {
    const result = parseListParams();
    
    assert.deepStrictEqual(result.filter, {});
    assert.strictEqual(result.search, null);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 25);
  });

  test('should extract allowed filterable parameters and ignore unallowed parameters', () => {
    const query = {
      role: 'viewer',
      isActive: 'true',
      unlistedParam: 'hack'
    };
    const options = {
      filterable: ['role', 'isActive']
    };

    const result = parseListParams(query, options);

    assert.deepStrictEqual(result.filter, { role: 'viewer', isActive: 'true' });
    assert.strictEqual(result.search, null);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 25);
  });

  test('should generate correct case-insensitive MongoDB $or regex search object when search parameter is present', () => {
    const query = {
      search: 'jane '
    };
    const options = {
      searchable: ['email', 'name']
    };

    const result = parseListParams(query, options);

    assert.deepStrictEqual(result.filter, {});
    assert.deepStrictEqual(result.search, {
      $or: [
        { email: { $regex: 'jane', $options: 'i' } },
        { name: { $regex: 'jane', $options: 'i' } }
      ]
    });
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 25);
  });

  test('should return null search if search query is only whitespace or searchable array is empty', () => {
    const resultWithEmptyQuery = parseListParams({ search: '   ' }, { searchable: ['name'] });
    assert.strictEqual(resultWithEmptyQuery.search, null);

    const resultWithEmptySearchable = parseListParams({ search: 'jane' }, { searchable: [] });
    assert.strictEqual(resultWithEmptySearchable.search, null);
  });

  test('should handle valid and custom pagination parameters', () => {
    const query = {
      page: '3',
      limit: '15'
    };

    const result = parseListParams(query);

    assert.strictEqual(result.page, 3);
    assert.strictEqual(result.limit, 15);
  });

  test('should normalize invalid, negative, or non-numeric page and limit parameters to defaults', () => {
    const negativeResult = parseListParams({ page: '-5', limit: '0' });
    assert.strictEqual(negativeResult.page, 1);
    assert.strictEqual(negativeResult.limit, 25);

    const nanResult = parseListParams({ page: 'abc', limit: 'xyz' });
    assert.strictEqual(nanResult.page, 1);
    assert.strictEqual(nanResult.limit, 25);
  });

  test('should support combined filter, search, and custom pagination params simultaneously', () => {
    const query = {
      role: 'devops_engineer',
      search: 'alice',
      page: '2',
      limit: '10',
      ignoredParam: 'test'
    };
    const options = {
      filterable: ['role'],
      searchable: ['name', 'email']
    };

    const result = parseListParams(query, options);

    assert.deepStrictEqual(result.filter, { role: 'devops_engineer' });
    assert.deepStrictEqual(result.search, {
      $or: [
        { name: { $regex: 'alice', $options: 'i' } },
        { email: { $regex: 'alice', $options: 'i' } }
      ]
    });
    assert.strictEqual(result.page, 2);
    assert.strictEqual(result.limit, 10);
  });
});
