const AuditLog = require('../models/AuditLog');
const { scopedFind } = require('../data/scopedQuery');
const { parseListParams } = require('../utils/queryHelpers');
const apiResponse = require('../utils/apiResponse');

/**
 * GET /audit-logs
 * 
 * Retrieves a paginated, organization-scoped, newest-first list of security audit logs.
 * Access is restricted to org_admin and super_admin roles.
 */
async function getAuditLogs(req, res, next) {
  try {
    const { page, limit } = parseListParams(req.query, {
      filterable: [],
      searchable: []
    });

    const skip = (page - 1) * limit;

    // Retrieve scoped, sorted, and paginated logs
    const query = scopedFind(AuditLog, req.context, {})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const auditLogs = await query;

    // Establish total count scoped to organization
    const total = await AuditLog.countDocuments({ orgId: req.context.orgId });
    const totalPages = Math.ceil(total / limit);

    return apiResponse.success(
      res,
      auditLogs,
      {
        page,
        limit,
        total,
        totalPages
      },
      200
    );
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getAuditLogs
};
