const Organization = require('../models/Organization');
const apiResponse = require('../utils/apiResponse');

/**
 * Validates email format for notification defaults
 */
function isValidEmail(email) {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return email && emailRegex.test(email);
}

/**
 * GET /organizations/me
 * 
 * Retrieves the organization profile for the authenticated tenant.
 */
async function getMyOrganization(req, res, next) {
  try {
    const { orgId } = req.context;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'No organization scope found in user context',
          details: []
        }
      });
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Organization not found',
          details: []
        }
      });
    }

    return apiResponse.success(
      res,
      {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        notificationDefaults: org.notificationDefaults || { alertEmailRecipients: [] },
        createdAt: org.createdAt
      },
      null,
      200
    );

  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /organizations/me
 * 
 * Updates settings for the authenticated organization.
 */
async function updateMyOrganization(req, res, next) {
  try {
    const { orgId } = req.context;
    const { name, notificationDefaults } = req.body;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'No organization scope found in user context',
          details: []
        }
      });
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Organization not found',
          details: []
        }
      });
    }

    // 1. Validate inputs
    const errors = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        errors.push('Organization name must be between 2 and 100 characters');
      }
    }

    if (notificationDefaults !== undefined) {
      if (!notificationDefaults || !Array.isArray(notificationDefaults.alertEmailRecipients)) {
        errors.push('notificationDefaults.alertEmailRecipients must be an array of email addresses');
      } else {
        const invalidEmails = notificationDefaults.alertEmailRecipients.filter(email => !isValidEmail(email));
        if (invalidEmails.length > 0) {
          errors.push(`Invalid email formats detected: ${invalidEmails.join(', ')}`);
        }
      }
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

    // 2. Perform updates
    if (name !== undefined) {
      org.name = name.trim();
      // Generate new slug if name changes
      org.slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    if (notificationDefaults !== undefined) {
      org.notificationDefaults = {
        alertEmailRecipients: notificationDefaults.alertEmailRecipients.map(e => e.trim().toLowerCase())
      };
    }

    await org.save();

    return apiResponse.success(
      res,
      {
        id: org._id.toString(),
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        notificationDefaults: org.notificationDefaults,
        createdAt: org.createdAt
      },
      null,
      200
    );

  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyOrganization,
  updateMyOrganization
};
