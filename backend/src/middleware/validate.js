const ApiError = require('../utils/apiError');

/**
 * Express middleware factory to validate requests against Joi schemas.
 * Matches schema keys (body, query, params) to req properties.
 * Collects all field-level validation messages into details and passes
 * ApiError(422, 'VALIDATION_ERROR', ...) on failure.
 * 
 * @param {Object} schema - Validation schema object with optional keys: body, query, params.
 * @returns {Function} Express middleware.
 */
function validate(schema) {
  return (req, res, next) => {
    const keys = ['body', 'query', 'params'];
    const details = [];

    for (const key of keys) {
      if (schema[key]) {
        const { error, value } = schema[key].validate(req[key], {
          abortEarly: false,
          stripUnknown: false
        });

        if (error) {
          for (const item of error.details) {
            details.push(item.message);
          }
        } else {
          req[key] = value;
        }
      }
    }

    if (details.length > 0) {
      return next(new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', details));
    }

    next();
  };
}

module.exports = validate;
