const AuditLog = require('../models/AuditLog');

/**
 * Fire-and-forget logging function that records a sensitive mutation in the audit trail.
 * Guaranteed to never throw or reject, protecting the parent transaction from logging failures.
 * 
 * @param {Object} params
 * @param {string|ObjectId} params.orgId - The organization ID scoped for the audit entry.
 * @param {string|ObjectId} params.actorUserId - The user ID who performed the action.
 * @param {string} params.action - A dot-namespaced string (e.g. "user.role_changed").
 * @param {string} params.targetType - The resource type affected (e.g. "User", "Organization").
 * @param {string|ObjectId} params.targetId - The ID of the target resource.
 * @param {Object} [params.metadata={}] - Free-form object containing action details.
 * @returns {Promise<Object|undefined>} The saved AuditLog document on success, or undefined on failure.
 */
async function logAudit({ orgId, actorUserId, action, targetType, targetId, metadata = {} }) {
  try {
    const auditLog = new AuditLog({
      orgId,
      actorUserId,
      action,
      targetType,
      targetId,
      metadata
    });
    
    return await auditLog.save();
  } catch (error) {
    console.error('Audit logging failed:', error);
    return undefined;
  }
}

module.exports = {
  logAudit
};
