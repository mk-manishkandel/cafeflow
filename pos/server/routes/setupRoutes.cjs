const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setupController.cjs');
const { checkPermission } = require('../middleware/auth.cjs');

// Payment Methods Routes
router.get('/payment-methods', checkPermission('MANAGE_PAYMENT_METHODS'), setupController.getPaymentMethods);
router.post('/payment-methods', checkPermission('MANAGE_PAYMENT_METHODS'), setupController.addPaymentMethod);
router.put('/payment-methods/:id', checkPermission('MANAGE_PAYMENT_METHODS'), setupController.updatePaymentMethod);
router.delete('/payment-methods/:id', checkPermission('MANAGE_PAYMENT_METHODS'), setupController.deletePaymentMethod);

// Email Config Routes
router.get('/email-config', checkPermission('MANAGE_EMAIL_CONFIG'), setupController.getEmailConfig);
router.post('/email-config', checkPermission('MANAGE_EMAIL_CONFIG'), setupController.updateEmailConfig);
router.post('/email-config/test', checkPermission('MANAGE_EMAIL_CONFIG'), setupController.testEmailConfig);

// Email Templates Management
router.get('/email-templates', checkPermission('MANAGE_EMAIL_TEMPLATES'), setupController.getEmailTemplates);
router.post('/email-templates', checkPermission('MANAGE_EMAIL_TEMPLATES'), setupController.updateEmailTemplate);
router.post('/email-templates/test', checkPermission('MANAGE_EMAIL_TEMPLATES'), setupController.testEmailTemplate);
router.delete('/email-templates/:key', checkPermission('MANAGE_EMAIL_TEMPLATES'), setupController.deleteEmailTemplate);
router.post('/email-templates/send', checkPermission(['MANAGE_EMAIL_TEMPLATES', 'CONSUMER_SEND_STATEMENT', 'STAFF_SEND_STATEMENT']), setupController.sendBulkEmailAction);
router.get('/report-schemas', checkPermission('MANAGE_EMAIL_TEMPLATES'), setupController.getReportSchemas);

module.exports = router;
