const mongoose = require('mongoose');

/**
 * RefreshToken Schema
 * 
 * Represents active refresh tokens issued to users for session management.
 * Includes a TTL index for automatic expiry cleanup.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      // required for non-super_admin users; nullable for super_admin
      required: [
        async function() {
          if (!this.userId) return true;
          try {
            const User = mongoose.model('User');
            const user = await User.findById(this.userId);
            if (user && user.role === 'super_admin') {
              return false;
            }
          } catch (err) {
            // Fallback to required if User model is not queryable
          }
          return true;
        },
        'Organization ID is required'
      ],
      default: null
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      required: [true, 'Issue date is required']
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      // TTL index: MongoDB will automatically delete this document at/after the expiresAt date.
      index: { expires: 0 }
    },
    revoked: {
      type: Boolean,
      default: false,
      required: [true, 'Revoked status is required']
    },
    userAgent: {
      type: String,
      trim: true
    }
  },
  {
    // No automatic timestamps required since we have issuedAt and expiresAt
    timestamps: false
  }
);

// Indexes
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1, revoked: 1 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;
