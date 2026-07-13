const mongoose = require('mongoose');

/**
 * Organization Schema
 * 
 * The tenancy root for the multi-tenant SaaS DevOps monitoring platform.
 * Represents an organization/tenant that owns resources and users.
 */
const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      minlength: [2, 'Organization name must be at least 2 characters long'],
      maxlength: [100, 'Organization name cannot exceed 100 characters']
    },
    slug: {
      type: String,
      required: [true, 'Organization slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      // Ensures the slug is alphanumeric and hyphenated (URL-friendly)
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Please provide a valid URL-friendly slug (letters, numbers, and hyphens only)'
      ],
      minlength: [2, 'Slug must be at least 2 characters long'],
      maxlength: [100, 'Slug cannot exceed 100 characters']
    },
    plan: {
      type: String,
      enum: {
        values: ['free', 'pro', 'enterprise'],
        message: '{VALUE} is not a valid plan type'
      },
      default: 'free',
      trim: true,
      lowercase: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    notificationDefaults: {
      alertEmailRecipients: {
        type: [
          {
            type: String,
            trim: true,
            lowercase: true,
            match: [
              /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
              'Please provide a valid email address'
            ]
          }
        ],
        default: []
      }
    }
  },
  {
    // Automatically manage createdAt and updatedAt fields
    timestamps: true
  }
);

// Indexes
// The unique index on slug is already implicitly created by `unique: true` in the field definition.
// We also create an explicit index on slug and isActive for performance optimizations.
organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ isActive: 1 });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
