/**
 * Standardized API response helper for success responses.
 * Matches the envelope: { success, data, meta, error: null }
 * 
 * @param {Object} res - Express response object.
 * @param {*} data - The response data payload.
 * @param {Object|null} [meta=null] - Optional metadata (pagination, etc).
 * @param {number} [statusCode=200] - HTTP status code (defaults to 200).
 * @returns {Object} The Express response.
 */
function success(res, data, meta = null, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta,
    error: null
  });
}

module.exports = {
  success
};
