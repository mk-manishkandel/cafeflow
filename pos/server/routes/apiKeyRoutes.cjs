const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKeyController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

// Check Permissions
router.post('/', checkPermission('MANAGE_API_KEYS'), apiKeyController.generateKey);
router.get('/', checkPermission('MANAGE_API_KEYS'), apiKeyController.listKeys);
router.delete('/:id', checkPermission('MANAGE_API_KEYS'), apiKeyController.revokeKey);

module.exports = router;
