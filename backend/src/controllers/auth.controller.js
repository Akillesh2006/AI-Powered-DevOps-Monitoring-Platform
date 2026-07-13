const Organization = require('../models/Organization');
const User = require('../models/User');
const { hashPassword } = require('../utils/password');
const { generateAccessToken } = require('../utils/jwt');
const { issueRefreshToken } = require('../services/refreshTokenService');

/**
 * Validates password strength (min 8 chars, must contain uppercase, lowercase, and number)
 */
function isStrongPassword(password) {
  if (!password || password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasUpper && hasLower && hasNumber;
}

/**
 * Validates email format
 */
function isValidEmail(email) {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return email && emailRegex.test(email);
}

/**
 * POST /auth/register
 * 
 * Registers a new organization along with an initial Org Admin account.
 */
async function register(req, res, next) {
  const { organizationName, adminEmail, adminPassword } = req.body;

  // 1. Validation Checks
  const errors = [];
  if (!organizationName || organizationName.trim().length < 2 || organizationName.trim().length > 100) {
    errors.push('Organization name is required and must be between 2 and 100 characters');
  }

  if (!adminEmail || !isValidEmail(adminEmail.trim())) {
    errors.push('A valid admin email is required');
  }

  if (!adminPassword || !isStrongPassword(adminPassword)) {
    errors.push('Password must be at least 8 characters long and contain uppercase, lowercase, and numeric characters');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors
      }
    });
  }

  const cleanEmail = adminEmail.trim().toLowerCase();
  let org = null;

  try {
    // 2. Check for Duplicate Email
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_RESOURCE',
          message: 'Email address is already registered',
          details: []
        }
      });
    }

    // 3. Create Organization
    const slug = organizationName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    org = new Organization({
      name: organizationName.trim(),
      slug
    });

    await org.save();

    // 4. Create User (Org Admin)
    const passwordHash = await hashPassword(adminPassword);
    const user = new User({
      orgId: org._id,
      email: cleanEmail,
      passwordHash,
      role: 'org_admin'
    });

    await user.save();

    // 5. Generate Access & Refresh Tokens
    const accessToken = generateAccessToken({
      userId: user._id,
      orgId: org._id,
      role: user.role
    });

    const refreshToken = await issueRefreshToken(user._id, org._id);

    // 6. Return Response
    return res.status(201).json({
      success: true,
      data: {
        organization: {
          id: org._id.toString(),
          name: org.name,
          slug: org.slug
        },
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role
        },
        accessToken,
        refreshToken
      }
    });

  } catch (err) {
    // Cleanup created organization if user creation fails
    if (org && org._id) {
      try {
        await Organization.deleteOne({ _id: org._id });
      } catch (cleanupErr) {
        console.error('Failed to cleanup organization after registration failure:', cleanupErr.message);
      }
    }
    
    return next(err);
  }
}

module.exports = {
  register
};
