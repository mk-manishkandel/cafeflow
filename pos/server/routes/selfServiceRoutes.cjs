const express = require('express');
const router = express.Router();
const { checkPermission } = require('../middleware/auth.cjs');
const selfServiceController = require('../controllers/selfServiceController.cjs');

router.get('/status', checkPermission('SELF_SERVICE_VIEW'), selfServiceController.getSelfServiceStatus);
router.post('/toggle-branch', checkPermission('SELF_SERVICE_MANAGE'), selfServiceController.toggleBranchStatus);
router.post('/toggle-item', checkPermission('SELF_SERVICE_MANAGE'), selfServiceController.toggleItemStatus);
router.post('/toggle-items', checkPermission('SELF_SERVICE_MANAGE'), selfServiceController.toggleItemsStatus);
router.get('/transactions', checkPermission('SELF_SERVICE_VIEW_TRANSACTIONS'), selfServiceController.getSelfServiceTransactions);
router.get('/logs', checkPermission('SELF_SERVICE_VIEW_LOGS'), selfServiceController.getFnBActivityLogs);

module.exports = router;
