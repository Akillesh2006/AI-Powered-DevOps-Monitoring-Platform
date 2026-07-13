const express = require('express');
const router = express.Router();
const { register } = require('../controllers/auth.controller');

// POST /auth/register - Register a new organization and admin account
router.post('/register', register);

module.exports = router;
