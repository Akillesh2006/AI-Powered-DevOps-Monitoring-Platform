/**
 * Tenant-Scoped Query Data Access Wrapper
 * 
 * WARNING & CODE REVIEW POLICY:
 * Any direct, unwrapped Mongoose model call touching a tenant-scoped collection
 * (e.g., Model.find, Model.findOne, Model.create, Model.updateOne, Model.deleteMany)
 * outside of this scopedQuery data-access wrapper should be treated as a critical
 * security code-review flag (per Data Model §6.3 and Security Design §7).
 * Always use this wrapper to ensure proper multi-tenant isolation and prevent cross-tenant leaks.
 */

/**
 * Ensures that the tenant's orgId is present in the context and enforces it.
 * 
 * @param {Object} context - Request context containing orgId
 * @private
 */
function validateContext(context) {
  if (!context || context.orgId === undefined) {
    throw new Error('Tenant context (orgId) is required for database operations');
  }
}

/**
 * Scoped find query.
 * Always overrides orgId in the filter with context.orgId.
 * 
 * @param {Object} Model - Mongoose model class
 * @param {Object} context - Request context { userId, orgId, role }
 * @param {Object} [filter] - User-supplied search filters
 * @param {Object} [options] - Mongoose query options
 * @returns {MongooseQuery} Mongoose query helper
 */
function scopedFind(Model, context, filter = {}, options = {}) {
  validateContext(context);
  const scopedFilter = { ...filter, orgId: context.orgId };
  return Model.find(scopedFilter, null, options);
}

/**
 * Scoped findOne query.
 * Always overrides orgId in the filter with context.orgId.
 * 
 * @param {Object} Model - Mongoose model class
 * @param {Object} context - Request context { userId, orgId, role }
 * @param {Object} [filter] - User-supplied search filters
 * @param {Object} [options] - Mongoose query options
 * @returns {MongooseQuery} Mongoose query helper
 */
function scopedFindOne(Model, context, filter = {}, options = {}) {
  validateContext(context);
  const scopedFilter = { ...filter, orgId: context.orgId };
  return Model.findOne(scopedFilter, null, options);
}

/**
 * Scoped create/save query.
 * Always overrides orgId in the document body with context.orgId.
 * 
 * @param {Object} Model - Mongoose model class
 * @param {Object} context - Request context { userId, orgId, role }
 * @param {Object} data - Document properties to save
 * @returns {Promise<Document>} The saved Mongoose document
 */
async function scopedCreate(Model, context, data = {}) {
  validateContext(context);
  const scopedData = { ...data, orgId: context.orgId };
  const document = new Model(scopedData);
  return document.save();
}

/**
 * Scoped updateOne query.
 * Always overrides orgId in the search filter with context.orgId.
 * 
 * @param {Object} Model - Mongoose model class
 * @param {Object} context - Request context { userId, orgId, role }
 * @param {Object} filter - Search filters to identify target document
 * @param {Object} update - Update actions/data
 * @param {Object} [options] - Mongoose update options
 * @returns {Promise<Object>} Update operation metadata
 */
async function scopedUpdateOne(Model, context, filter = {}, update = {}, options = {}) {
  validateContext(context);
  const scopedFilter = { ...filter, orgId: context.orgId };
  
  // Prevent changing the tenant ownership (orgId) during update operations
  if (update.$set && update.$set.orgId !== undefined) {
    delete update.$set.orgId;
  }
  
  return Model.updateOne(scopedFilter, update, options);
}

/**
 * Scoped updateMany query.
 * Always overrides orgId in the search filter with context.orgId.
 * 
 * @param {Object} Model - Mongoose model class
 * @param {Object} context - Request context { userId, orgId, role }
 * @param {Object} filter - Search filters to identify target documents
 * @param {Object} update - Update actions/data
 * @param {Object} [options] - Mongoose update options
 * @returns {Promise<Object>} Update operation metadata
 */
async function scopedUpdateMany(Model, context, filter = {}, update = {}, options = {}) {
  validateContext(context);
  const scopedFilter = { ...filter, orgId: context.orgId };

  if (update.$set && update.$set.orgId !== undefined) {
    delete update.$set.orgId;
  }

  return Model.updateMany(scopedFilter, update, options);
}

/**
 * Scoped deleteOne query.
 * Always overrides orgId in the search filter with context.orgId.
 * 
 * @param {Object} Model - Mongoose model class
 * @param {Object} context - Request context { userId, orgId, role }
 * @param {Object} filter - Search filters to identify target document
 * @returns {Promise<Object>} Delete operation metadata
 */
async function scopedDeleteOne(Model, context, filter = {}) {
  validateContext(context);
  const scopedFilter = { ...filter, orgId: context.orgId };
  return Model.deleteOne(scopedFilter);
}

/**
 * Scoped deleteMany query.
 * Always overrides orgId in the search filter with context.orgId.
 * 
 * @param {Object} Model - Mongoose model class
 * @param {Object} context - Request context { userId, orgId, role }
 * @param {Object} filter - Search filters to identify target documents
 * @returns {Promise<Object>} Delete operation metadata
 */
async function scopedDeleteMany(Model, context, filter = {}) {
  validateContext(context);
  const scopedFilter = { ...filter, orgId: context.orgId };
  return Model.deleteMany(scopedFilter);
}

/**
 * Scoped soft delete query.
 * Always overrides orgId in the search filter with context.orgId.
 * Sets isDeleted: true and deletedAt: new Date() on the target document.
 * 
 * @param {Object} Model - Mongoose model class
 * @param {Object} context - Request context { userId, orgId, role }
 * @param {Object} filter - Search filters to identify target document
 * @returns {Promise<Object>} Update operation metadata
 */
async function scopedSoftDeleteOne(Model, context, filter = {}) {
  validateContext(context);
  const scopedFilter = { ...filter, orgId: context.orgId };
  
  const update = {
    $set: {
      isDeleted: true,
      deletedAt: new Date()
    }
  };
  
  return Model.updateOne(scopedFilter, update);
}

module.exports = {
  scopedFind,
  scopedFindOne,
  scopedCreate,
  scopedUpdateOne,
  scopedUpdateMany,
  scopedDeleteOne,
  scopedDeleteMany,
  scopedSoftDeleteOne
};
