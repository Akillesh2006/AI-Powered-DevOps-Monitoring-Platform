const mongoose = require('mongoose');

/**
 * User Schema
 * 
 * Represents user accounts in the system. Enforces role-based permissions
 * and tenant isolation using the `orgId` field.
 */
const userSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      // orgId is required for all roles EXCEPT super_admin
      required: [
        function() {
          return this.role !== 'super_admin';
        },
        'Organization ID is required for non-super_admin users'
      ],
      // Enforce null/undefined orgId for super_admin, and non-null for other roles
      validate: {
        validator: function(val) {
          if (this.role === 'super_admin') {
            return val === null || val === undefined;
          }
          return val !== null && val !== undefined;
        },
        message: 'super_admin must have a null orgId, while all other roles require a valid orgId'
      },
      default: null
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address'
      ]
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required']
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['super_admin', 'org_admin', 'devops_engineer', 'team_lead', 'viewer'],
        message: '{VALUE} is not a valid role'
      },
      trim: true,
      lowercase: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    notificationPreferences: {
      emailEnabled: {
        type: Boolean,
        default: true
      },
      inAppEnabled: {
        type: Boolean,
        default: true
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes
// Compound unique index on (orgId, email) - allows same email in different orgs
userSchema.index({ orgId: 1, email: 1 }, { unique: true });
// Index on (orgId, role) for role-based queries
userSchema.index({ orgId: 1, role: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
