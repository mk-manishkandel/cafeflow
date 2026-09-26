const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');
const { bulkImportLimiter, financialLimiter } = require('../middleware/rateLimit.cjs');
const { idempotency } = require('../middleware/idempotency.cjs');

// Management
router.get('/', checkPermission('STAFF_VIEW'), staffController.getStaff);
router.post('/', checkPermission('STAFF_ADD'), staffController.createStaff);
router.put('/:id', checkPermission('STAFF_EDIT'), staffController.updateStaff);
router.delete('/:id', checkPermission('STAFF_DELETE'), staffController.deleteStaff);

// Advanced Actions
router.post('/reset-allowances', financialLimiter, checkPermission('STAFF_RESET'), idempotency, staffController.resetAllowances);
router.post('/:id/reset-allowance', financialLimiter, checkPermission('STAFF_RESET'), staffController.resetSingleAllowance);
router.post('/bulk-import', bulkImportLimiter, checkPermission('STAFF_BULK_IMPORT'), staffController.bulkImport);
router.get('/export', checkPermission('EXPORT_REPORTS'), staffController.exportStaff);

module.exports = router;
