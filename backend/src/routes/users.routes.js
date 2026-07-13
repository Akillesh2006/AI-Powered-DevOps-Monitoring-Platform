const express = require('express');
const router = express.Router();
const { getUsers, inviteUser, updateUserRole, deleteUser } = require('../controllers/users.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// GET /users - List users in caller's org
router.get('/', authenticate, authorize('users', 'list'), getUsers);

// POST /users/invite - Invite a new user to caller's org
router.post('/invite', authenticate, authorize('users', 'invite'), inviteUser);

// PATCH /users/:id/role - Change a user's role
router.patch('/:id/role', authenticate, authorize('users', 'change_role'), updateUserRole);

// DELETE /users/:id - Deactivate/remove a user from the org
router.delete('/:id', authenticate, authorize('users', 'delete'), deleteUser);

module.exports = router;
