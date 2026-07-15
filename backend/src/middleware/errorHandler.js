const ApiError = require('../utils/apiError');

/**
 * Global Express Error Handling Middleware
 * Standardizes API responses for both defined ApiErrors and generic/unexpected errors.
 */
function errorHandler(err, req, res, next) {
  // If the error is an instance of ApiError, use its defined status, code, message, and details
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      data: null,
      meta: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || []
      }
    });
  }

  // Log the unexpected error server-side for internal diagnostic purposes
  console.error(err);

  // Fallback response for generic/unexpected errors to avoid leaking internal system details
  return res.status(500).json({
    success: false,
    data: null,
    meta: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred on the server',
      details: []
    }
  });
}

module.exports = errorHandler;
