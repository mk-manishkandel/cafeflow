const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

router.get('/', checkPermission('MANAGE_ROLES'), userController.getRoles);
router.post('/', checkPermission('MANAGE_ROLES'), userController.createRole);
router.put('/:name', checkPermission('MANAGE_ROLES'), userController.updateRole);
router.delete('/:name', checkPermission('MANAGE_ROLES'), userController.deleteRole);

module.exports = router;
