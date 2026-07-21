const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const { hashPassword, comparePassword } = require('../utils/password');
const {
  scopedFind,
  scopedFindOne,
  scopedCreate,
  scopedDeleteOne,
  scopedSoftDeleteOne
} = require('../data/scopedQuery');
const { parseListParams } = require('../utils/queryHelpers');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');
const { logAudit } = require('../services/auditLogger.service');

/**
 * Validates email format
 */
function isValidEmail(email) {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return email && emailRegex.test(email);
}

/**
 * GET /users
 * 
 * Lists all users scoped to the caller's organization.
 */
async function getUsers(req, res, next) {
  try {
    const { filter, search, page, limit } = parseListParams(req.query, {
      filterable: ['role', 'isActive'],
      searchable: ['email', 'name']
    });

    const skip = (page - 1) * limit;

    const queryConditions = {};
    if (Object.keys(filter).length > 0 && search) {
      queryConditions.$and = [filter, search];
    } else if (Object.keys(filter).length > 0) {
      Object.assign(queryConditions, filter);
    } else if (search) {
      Object.assign(queryConditions, search);
    }

    const query = scopedFind(User, req.context, queryConditions)
      .skip(skip)
      .limit(limit);

    const users = await query;

    const countFilter = { ...queryConditions, orgId: req.context.orgId };
    const total = await User.countDocuments(countFilter);
    const totalPages = Math.ceil(total / limit);

    const data = users.map(user => ({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      isActive: user.isActive
    }));

    return res.status(200).json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages
      }
    });

  } catch (err) {
    return next(err);
  }
}

/**
 * POST /users/invite
 * 
 * Invites a new user to the caller's organization.
 */
async function inviteUser(req, res, next) {
  const { email, role } = req.body;

  // 1. Validation
  if (!email || !isValidEmail(email.trim())) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A valid email is required',
        details: []
      }
    });
  }

  const allowedRoles = ['org_admin', 'devops_engineer', 'team_lead', 'viewer'];
  if (!role || !allowedRoles.includes(role.trim().toLowerCase())) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid role value',
        details: [`Role must be one of: ${allowedRoles.join(', ')}`]
      }
    });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanRole = role.trim().toLowerCase();

  try {
    // 2. Check for Duplicate Email within the organization
    const existingUser = await scopedFindOne(User, req.context, { email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_RESOURCE',
          message: 'User is already a member of this organization',
          details: []
        }
      });
    }

    // 3. Create User Document with random temp password (since it is an invitation)
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await hashPassword(tempPassword);

    const newUser = await scopedCreate(User, req.context, {
      email: cleanEmail,
      role: cleanRole,
      passwordHash,
      isActive: true
    });

    logAudit({
      orgId: req.context.orgId,
      actorUserId: req.context.userId,
      action: 'user.invited',
      targetType: 'User',
      targetId: newUser._id,
      metadata: { invitedRole: cleanRole }
    });

    return res.status(201).json({
      success: true,
      data: {
        id: newUser._id.toString(),
        email: newUser.email,
        role: newUser.role,
        status: 'invited'
      }
    });

  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /users/:id/role
 * 
 * Updates a target user's role, scoped to the caller's organization.
 */
async function updateUserRole(req, res, next) {
  const { id } = req.params;
  const { role } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'User not found in organization',
        details: []
      }
    });
  }

  const allowedRoles = ['org_admin', 'devops_engineer', 'team_lead', 'viewer'];
  if (!role || !allowedRoles.includes(role.trim().toLowerCase())) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid role value',
        details: [`Role must be one of: ${allowedRoles.join(', ')}`]
      }
    });
  }

  const cleanRole = role.trim().toLowerCase();

  try {
    // 1. Fetch user within the caller's tenant
    const targetUser = await scopedFindOne(User, req.context, { _id: id });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'User not found in organization',
          details: []
        }
      });
    }

    // 2. Business Rule: Cannot demote the last remaining org_admin
    if (targetUser.role === 'org_admin' && cleanRole !== 'org_admin') {
      const adminCount = await User.countDocuments({
        orgId: req.context.orgId,
        role: 'org_admin',
        isActive: true
      });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Cannot demote the last remaining organization administrator',
            details: []
          }
        });
      }
    }

    // 3. Update and save
    const fromRole = targetUser.role;
    targetUser.role = cleanRole;
    await targetUser.save();

    logAudit({
      orgId: req.context.orgId,
      actorUserId: req.context.userId,
      action: 'user.role_changed',
      targetType: 'User',
      targetId: targetUser._id,
      metadata: { fromRole, toRole: cleanRole }
    });

    return res.status(200).json({
      success: true,
      data: {
        id: targetUser._id.toString(),
        email: targetUser.email,
        role: targetUser.role,
        isActive: targetUser.isActive
      }
    });

  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /users/:id
 * 
 * Removes or deactivates a user, scoped to the caller's organization.
 */
async function deleteUser(req, res, next) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'User not found in organization',
        details: []
      }
    });
  }

  try {
    // 1. Fetch user within the caller's tenant
    const targetUser = await scopedFindOne(User, req.context, { _id: id });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'User not found in organization',
          details: []
        }
      });
    }

    // 2. Business Rule: Cannot delete the last remaining active org_admin
    if (targetUser.role === 'org_admin') {
      const adminCount = await User.countDocuments({
        orgId: req.context.orgId,
        role: 'org_admin',
        isActive: true
      });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Cannot delete the last remaining organization administrator',
            details: []
          }
        });
      }
    }

    // 3. Soft delete using the scoped delete wrapper
    await scopedSoftDeleteOne(User, req.context, { _id: id });

    logAudit({
      orgId: req.context.orgId,
      actorUserId: req.context.userId,
      action: 'user.deleted',
      targetType: 'User',
      targetId: id,
      metadata: {}
    });

    return res.status(204).end();

  } catch (err) {
    return next(err);
  }
}

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
 * GET /users/me
 * 
 * Retrieves the profile details of the authenticated caller.
 */
async function getSelfProfile(req, res, next) {
  try {
    const { userId } = req.context;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'User profile not found',
          details: []
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user._id.toString(),
        name: user.name || '',
        email: user.email,
        role: user.role,
        orgId: user.orgId ? user.orgId.toString() : null
      }
    });

  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /users/me
 * 
 * Allows self-updating profile details (name) and changing password.
 */
async function updateSelfProfile(req, res, next) {
  const { name, currentPassword, newPassword } = req.body;
  const { userId } = req.context;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'User profile not found',
          details: []
        }
      });
    }

    // 1. If password change is requested
    if (newPassword !== undefined) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Current password is required to change password',
            details: []
          }
        });
      }

      // Verify current password
      const isMatch = await comparePassword(currentPassword, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Incorrect current password',
            details: []
          }
        });
      }

      // Validate new password strength
      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'New password does not meet complexity requirements',
            details: ['Password must be at least 8 characters long and contain uppercase, lowercase, and numeric characters']
          }
        });
      }

      user.passwordHash = await hashPassword(newPassword);
    }

    // 2. If name update is requested
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length > 100) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Name cannot exceed 100 characters',
            details: []
          }
        });
      }
      user.name = name.trim();
    }

    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        id: user._id.toString(),
        name: user.name || '',
        email: user.email,
        role: user.role,
        orgId: user.orgId ? user.orgId.toString() : null
      }
    });

  } catch (err) {
    return next(err);
  }
}

/**
 * GET /users/:id
 * 
 * Retrieves a single user by ID, scoped to the caller's organization.
 */
async function getUser(req, res, next) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ApiError(404, 'USER_NOT_FOUND', 'User not found in organization', []));
  }

  try {
    const user = await scopedFindOne(User, req.context, { _id: id }).select('-passwordHash');
    if (!user) {
      throw new ApiError(404, 'USER_NOT_FOUND', 'User not found in organization', []);
    }

    const userObj = user.toObject ? user.toObject() : { ...user };
    delete userObj.passwordHash;

    if (userObj._id) {
      userObj.id = userObj._id.toString();
    }

    return apiResponse.success(res, userObj, null, 200);

  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getUsers,
  getUser,
  inviteUser,
  updateUserRole,
  deleteUser,
  getSelfProfile,
  updateSelfProfile
};
