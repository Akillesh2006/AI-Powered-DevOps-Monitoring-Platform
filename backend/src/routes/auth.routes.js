const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/auth.controller');

// POST /auth/register - Register a new organization and admin account
router.post('/register', register);

// POST /auth/login - Authenticate a user and return tokens
router.post('/login', login);

module.exports = router;
