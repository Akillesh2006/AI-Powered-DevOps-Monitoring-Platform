const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLogs.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /audit-logs - Retrieve organization-scoped audit logs
router.get('/', authenticate, authorize('audit', 'read'), getAuditLogs);

module.exports = router;
