const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

router.get('/', checkPermission('VIEW_AUDIT_LOGS'), auditController.getAuditLogs);
// Audit entries are created server-side via logAction(); external POST requires MANAGE_AUDIT_LOGS
router.post('/', checkPermission('MANAGE_AUDIT_LOGS'), auditController.createAuditLog);

router.get('/export', checkPermission('EXPORT_REPORTS'), auditController.exportAuditLogs);

module.exports = router;
