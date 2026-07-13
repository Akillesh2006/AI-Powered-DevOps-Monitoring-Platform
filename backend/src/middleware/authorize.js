const { hasPermission } = require('../config/permissions');

/**
 * RBAC Authorization Middleware Factory
 * 
 * Generates an Express middleware that checks the authenticated user's role 
 * against the permissions configuration for the specified resource and action.
 * Enforces a strict default-deny policy if req.context is missing or invalid.
 * 
 * @param {string} resource - The target resource (e.g., 'servers', 'users')
 * @param {string} action - The action being performed (e.g., 'create', 'read')
 * @returns {Function} Express middleware function (req, res, next)
 */
function authorize(resource, action) {
  return (req, res, next) => {
    // If authenticate middleware did not set context, deny access
    if (!req.context || !req.context.role) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied: Authentication context is missing',
          details: []
        }
      });
    }

    const isAllowed = hasPermission(req.context.role, resource, action);

    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied: Role '${req.context.role}' is not authorized to perform '${action}' on '${resource}'`,
          details: []
        }
      });
    }

    next();
  };
}

module.exports = authorize;
