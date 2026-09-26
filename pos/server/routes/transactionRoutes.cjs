const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

// H1 duplicate-sale hardening: POST /api/transactions REQUIRES a client-generated
// 'Idempotency-Key' (UUID). The transactions table is PARTITION BY RANGE (date),
// so PostgreSQL cannot enforce global uniqueness of a client_request_id via a
// unique index (unique indexes on partitioned tables must include the partition
// key). Enforcement is therefore: 400 here when the header is absent, plus the
// atomic Redis reserve-or-replay in mutations.cjs/shared.cjs for duplicates.
const requireIdempotencyKey = (req, res, next) => {
    const raw = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
    if (typeof raw !== 'string' || raw.trim() === '') {
        return res.status(400).json({ error: 'Idempotency-Key header is required for this endpoint' });
    }
    next();
};

router.get('/', checkPermission('TRANSACTION_VIEW'), transactionController.getTransactions);
router.post('/', requireIdempotencyKey, checkPermission('ACCESS_POS'), transactionController.createTransaction);
router.post('/refund', checkPermission('ACCESS_POS'), transactionController.refundTransaction);
router.post('/delete', checkPermission('ACCESS_POS'), transactionController.deleteTransaction);
router.post('/change-staff', checkPermission('STAFF_EDIT'), transactionController.changeStaff);

router.get('/export', checkPermission('EXPORT_REPORTS'), transactionController.exportTransactions);
router.get('/export-consumption', checkPermission('EXPORT_REPORTS'), transactionController.exportConsumption);
router.get('/export-item-analytics', checkPermission('EXPORT_REPORTS'), transactionController.exportItemAnalytics);

module.exports = router;
