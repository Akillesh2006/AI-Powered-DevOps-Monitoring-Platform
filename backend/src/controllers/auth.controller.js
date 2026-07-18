const Organization = require('../models/Organization');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const apiResponse = require('../utils/apiResponse');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateAccessToken } = require('../utils/jwt');
const { issueRefreshToken, rotateRefreshToken, hashToken } = require('../services/refreshTokenService');

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
    return apiResponse.success(
      res,
      {
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
      },
      null,
      201
    );

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

/**
 * POST /auth/login
 * 
 * Authenticates a user using credentials and returns tokens.
 */
async function login(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Email and password are required',
        details: []
      }
    });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const user = await User.findOne({ email: cleanEmail });

    // Enumeration-safe dummy hash for comparison timing if user not found
    const dummyHash = '$2b$12$12345678901234567890123456789012345678901234567890123';
    const targetHash = user ? user.passwordHash : dummyHash;

    const isMatch = await comparePassword(password, targetHash);

    if (!user || !isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
          details: []
        }
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Account is deactivated',
          details: []
        }
      });
    }

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Account no longer exists',
          details: []
        }
      });
    }

    const accessToken = generateAccessToken({
      userId: user._id,
      orgId: user.orgId,
      role: user.role
    });

    const refreshToken = await issueRefreshToken(user._id, user.orgId);

    return apiResponse.success(
      res,
      {
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          orgId: user.orgId ? user.orgId.toString() : null
        },
        accessToken,
        refreshToken
      },
      null,
      200
    );

  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/refresh
 * 
 * Rotates a refresh token and issues a new access/refresh token pair.
 */
async function refresh(req, res, next) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Refresh token is required',
        details: []
      }
    });
  }

  try {
    const tokenHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash });

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid refresh token',
          details: []
        }
      });
    }

    let newRefreshToken;
    try {
      newRefreshToken = await rotateRefreshToken(refreshToken);
    } catch (err) {
      if (err.code === 'REUSE_DETECTED') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Refresh token reuse detected',
            details: []
          }
        });
      }
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: err.message,
          details: []
        }
      });
    }

    const user = await User.findById(storedToken.userId);
    if (!user || !user.isActive || user.isDeleted) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User account is invalid or deactivated',
          details: []
        }
      });
    }

    const accessToken = generateAccessToken({
      userId: user._id,
      orgId: user.orgId,
      role: user.role
    });

    return apiResponse.success(
      res,
      {
        accessToken,
        refreshToken: newRefreshToken
      },
      null,
      200
    );

  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/logout
 * 
 * Revokes a specific refresh token session.
 */
async function logout(req, res, next) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Refresh token is required to logout',
        details: []
      }
    });
  }

  try {
    const tokenHash = hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash });

    if (storedToken) {
      // Ensure user owns this token session
      if (storedToken.userId.toString() !== req.context.userId.toString()) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You are not authorized to revoke this token',
            details: []
          }
        });
      }

      storedToken.revoked = true;
      await storedToken.save();
    }

    return apiResponse.success(res, null, null, 204);

  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout
};
