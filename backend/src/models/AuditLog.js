const mongoose = require('mongoose');

/**
 * AuditLog Schema
 * 
 * Represents an immutable, admin-facing security audit trail entry.
 * Tracks sensitive mutations such as role changes, user deletions, 
 * organization settings updates, and user invitations.
 */
const auditLogSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required']
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor User ID is required']
    },
    action: {
      type: String,
      required: [true, 'Action is required']
    },
    targetType: {
      type: String,
      required: [true, 'Target type is required']
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Target ID is required']
    },
    metadata: {
      type: Object,
      default: {}
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
