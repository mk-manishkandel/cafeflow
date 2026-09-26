const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');
const { validate, schemas } = require('../middleware/validation.cjs');
const { globalApiLimiter } = require('../middleware/rateLimit.cjs');

// Users
router.get('/', globalApiLimiter, checkPermission('MANAGE_USERS'), userController.getUsers);
router.post('/', globalApiLimiter, checkPermission('MANAGE_USERS'), validate(schemas.user), userController.createUser);
router.put('/:id', globalApiLimiter, checkPermission('MANAGE_USERS'), validate(schemas.user), userController.updateUser);
router.delete('/:id', globalApiLimiter, checkPermission('MANAGE_USERS'), userController.deleteUser);

module.exports = router;
