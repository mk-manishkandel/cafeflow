const express = require('express');
const router = express.Router();
const c = require('../controllers/printerController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');
const { configLimiter } = require('../middleware/rateLimit.cjs');

const read = checkPermission('ACCESS_POS');
const manage = checkPermission('MANAGE_BRANCHES');

// Read-only routes
router.get('/status',                   read,   c.getStatus);
router.get('/available-services',       read,   c.getAvailableServices);
router.get('/for-service/:serviceType', read,   c.getForService);
router.get('/',                         read,   c.listPrinters);

// Mutation routes
router.post('/',               manage,  configLimiter, c.createPrinter);
router.put('/:id',             manage,  configLimiter, c.updatePrinter);
router.delete('/:id',          manage,  configLimiter, c.deletePrinter);
router.post('/:id/assign',     manage,  configLimiter, c.assignServices);
router.post('/:id/retry',          manage, configLimiter, c.retryFailed);
router.post('/:id/cancel-pending', manage, configLimiter, c.cancelPending);
router.get('/:id/jobs',            read,   c.getJobs);
router.delete('/:id/jobs/:jobId',  manage, c.deleteJob);
router.get('/:id/test',            read,   c.testConnection);

module.exports = router;
