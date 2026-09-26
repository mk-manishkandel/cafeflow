const express = require('express');
const router = express.Router();
const printController = require('../controllers/printController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

router.post('/submit',  checkPermission('ACCESS_POS'),    printController.submitPrint);
router.post('/queue',   checkPermission('ACCESS_POS'),    printController.queuePrintJob);
router.get('/jobs',     checkPermission('VIEW_REPORTS'),  printController.getJobHistory);

module.exports = router;
