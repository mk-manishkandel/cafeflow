const express = require('express');
const router = express.Router();
const consumerController = require('../controllers/consumerController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');
const { financialLimiter, bulkAdminLimiter } = require('../middleware/rateLimit.cjs');
const { idempotency } = require('../middleware/idempotency.cjs');

// Management
router.get('/', checkPermission('CONSUMER_VIEW'), consumerController.getConsumers);
router.post('/', checkPermission('CONSUMER_ADD'), consumerController.createConsumer);
router.put('/:id', checkPermission('CONSUMER_EDIT'), consumerController.updateConsumer);
router.delete('/:id', checkPermission('CONSUMER_DELETE'), consumerController.deleteConsumer);

// Advanced Actions
// SEC-M23: bulkAdminLimiter (3 req/15min) prevents repeated financial state churn from this destructive operation.
router.post('/reset-allowances', bulkAdminLimiter, financialLimiter, checkPermission('CONSUMER_RESET'), idempotency, consumerController.resetAllowances);
router.post('/:id/settle', financialLimiter, checkPermission('CONSUMER_EDIT'), idempotency, consumerController.settleBalance);


// Export
router.get('/export', checkPermission('CONSUMER_EXPORT_CSV'), consumerController.exportConsumers);

module.exports = router;
