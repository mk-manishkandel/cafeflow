const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

router.get('/stats', checkPermission('VIEW_REPORTS'), dashboardController.getDashboardStats);

module.exports = router;
