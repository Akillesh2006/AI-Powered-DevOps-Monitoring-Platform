const express = require('express');
const router = express.Router();
const { getPlatformOrganizations } = require('../controllers/platform.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /platform/organizations - Platform-level list of organizations (super_admin only)
router.get('/organizations', authenticate, authorize('organization', 'list_platform'), getPlatformOrganizations);

module.exports = router;
