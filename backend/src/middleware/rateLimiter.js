const ipStore = {};

/**
 * Periodically purges expired rate-limit records to avoid memory leaks.
 */
function cleanupStore() {
  const now = Date.now();
  for (const ip in ipStore) {
    for (const key in ipStore[ip]) {
      if (now > ipStore[ip][key].resetTime) {
        delete ipStore[ip][key];
      }
    }
    if (Object.keys(ipStore[ip]).length === 0) {
      delete ipStore[ip];
    }
  }
}

// Schedule memory cleanup every 60 seconds
const intervalId = setInterval(cleanupStore, 60000);
if (intervalId && typeof intervalId.unref === 'function') {
  intervalId.unref(); // Allows node tests/processes to exit cleanly without waiting for this interval
}

/**
 * Rate Limiter Factory
 * 
 * Creates an IP-based request rate limiter middleware.
 * 
 * @param {Object} options
 * @param {string} options.key - Unique key for the rate limiter bucket
 * @param {number} options.windowMs - Time window size in milliseconds
 * @param {number} options.max - Maximum requests allowed per IP within the window
 * @param {string} options.message - Error message to respond with on limit breach
 */
function createRateLimiter({ key, windowMs, max, message }) {
  return (req, res, next) => {
    // Resolve client IP (including handling of forward headers)
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
    const now = Date.now();

    if (!ipStore[ip]) {
      ipStore[ip] = {};
    }

    let record = ipStore[ip][key];

    // If no record exists or the time window has rolled over, initialize a new window bucket
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
      ipStore[ip][key] = record;
    }

    record.count++;

    // If count exceeds max requests, block the request and set standard Retry-After header
    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: message || 'Too many requests, please try again later.',
          details: [`Retry after ${retryAfterSeconds} seconds`]
        }
      });
    }

    next();
  };
}

// 5 requests / minute / IP
const loginLimiter = createRateLimiter({
  key: 'login',
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again after 60 seconds.'
});

// 3 requests / minute / IP
const registerLimiter = createRateLimiter({
  key: 'register',
  windowMs: 60 * 1000,
  max: 3,
  message: 'Too many registration attempts. Please try again after 60 seconds.'
});

module.exports = {
  loginLimiter,
  registerLimiter,
  ipStore
};
