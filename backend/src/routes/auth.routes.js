const express = require('express');
const router = express.Router();
const { register, login, refresh, logout } = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');

// POST /auth/register - Register a new organization and admin account
router.post('/register', register);

// POST /auth/login - Authenticate a user and return tokens
router.post('/login', login);

// POST /auth/refresh - Rotate a refresh token and return new tokens
router.post('/refresh', refresh);

// POST /auth/logout - Revoke a refresh token (requires authentication)
router.post('/logout', authenticate, logout);

module.exports = router;
