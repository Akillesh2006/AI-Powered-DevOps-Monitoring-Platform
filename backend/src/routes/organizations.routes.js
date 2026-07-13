const express = require('express');
const router = express.Router();
const { getMyOrganization, updateMyOrganization } = require('../controllers/organizations.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /organizations/me - Fetch the caller's organization details (all roles authorized)
router.get('/me', authenticate, authorize('organization', 'read'), getMyOrganization);

// PUT /organizations/me - Update the caller's organization details (org_admin only)
router.put('/me', authenticate, authorize('organization', 'update'), updateMyOrganization);

module.exports = router;
