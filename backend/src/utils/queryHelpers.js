/**
 * Normalized Query Parsing Helper for List Endpoints
 * 
 * Extracts, sanitizes, and formats filter, search, and pagination parameters
 * from req.query based on a configuration matrix.
 * 
 * @param {Object} query - The raw request query object (req.query)
 * @param {Object} options - Configuration options
 * @param {Array<string>} options.filterable - List of query keys allowed for filter match
 * @param {Array<string>} options.searchable - List of document fields to match req.query.search against
 * @returns {Object} Shape: { filter: Object, search: Object|null, page: number, limit: number }
 */
function parseListParams(query = {}, options = {}) {
  const { filterable = [], searchable = [] } = options;

  // 1. Pagination params parsing & defaulting
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || 25;

  if (page <= 0) {
    page = 1;
  }
  if (limit <= 0) {
    limit = 25;
  }

  // 2. Filter parsing (strict permit-list matching)
  const filter = {};
  filterable.forEach(field => {
    if (query[field] !== undefined) {
      filter[field] = query[field];
    }
  });

  // 3. Search parsing (constructs $or MongoDB regex matching)
  let search = null;
  if (query.search && searchable.length > 0) {
    const cleanSearch = String(query.search).trim();
    if (cleanSearch) {
      search = {
        $or: searchable.map(field => ({
          [field]: { $regex: cleanSearch, $options: 'i' }
        }))
      };
    }
  }

  return {
    filter,
    search,
    page,
    limit
  };
}

module.exports = {
  parseListParams
};
