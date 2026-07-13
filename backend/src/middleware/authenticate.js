const { verifyAccessToken } = require('../utils/jwt');

/**
 * Authentication Middleware (JWT Verification)
 * 
 * Extracts the Bearer token from the Authorization header,
 * verifies it, and attaches the decoded claims (userId, orgId, role) 
 * to req.context.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token is required',
        details: []
      }
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authorization header format must be Bearer <token>',
        details: []
      }
    });
  }

  const token = parts[1];

  try {
    const decoded = verifyAccessToken(token);
    
    // Map JWT claims (sub, orgId, role) to the request context
    req.context = {
      userId: decoded.sub,
      orgId: decoded.orgId,
      role: decoded.role
    };
    
    next();
  } catch (err) {
    let code = 'UNAUTHORIZED';
    let message = 'Invalid or tampered token';

    if (err.name === 'TokenExpiredError') {
      code = 'TOKEN_EXPIRED';
      message = 'Token has expired';
    }

    return res.status(401).json({
      success: false,
      error: {
        code,
        message,
        details: []
      }
    });
  }
}

module.exports = authenticate;
