const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/ledgerController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

// Get ledger entries for a specific entity (STAFF/CONSUMER)
// Accessible with VIEW_REPORTS, CONSUMER_EDIT, or STAFF_EDIT
router.get('/', checkPermission(['VIEW_REPORTS', 'CONSUMER_EDIT', 'STAFF_EDIT']), ledgerController.getLedgerEntries);
router.get('/export', checkPermission(['VIEW_REPORTS', 'CONSUMER_EDIT', 'STAFF_EDIT']), ledgerController.exportIndividualStatement);

module.exports = router;
