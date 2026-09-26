const express = require('express');
const router = express.Router();
const { authMiddleware, checkPermission } = require('../middleware/auth.cjs');
const {
    getDocumentTemplates,
    getDocumentTemplate,
    createDocumentTemplate,
    updateDocumentTemplate,
    deleteDocumentTemplate,
    getDocumentTemplatePlaceholders
} = require('../controllers/documentTemplateController.cjs');

// All routes require authentication
router.use(authMiddleware);

// GET /api/document-templates - Get all document templates
router.get('/', checkPermission('MANAGE_EMAIL_TEMPLATES'), getDocumentTemplates);

// GET /api/document-templates/placeholders - Get available placeholders for template types
router.get('/placeholders', checkPermission('MANAGE_EMAIL_TEMPLATES'), getDocumentTemplatePlaceholders);

// GET /api/document-templates/:id - Get single document template
router.get('/:id', checkPermission('MANAGE_EMAIL_TEMPLATES'), getDocumentTemplate);

// POST /api/document-templates - Create new document template
// Using MANAGE_EMAIL_TEMPLATES permission (same as system templates)
router.post('/', checkPermission('MANAGE_EMAIL_TEMPLATES'), createDocumentTemplate);

// PUT /api/document-templates/:id - Update document template
router.put('/:id', checkPermission('MANAGE_EMAIL_TEMPLATES'), updateDocumentTemplate);

// DELETE /api/document-templates/:id - Delete document template
router.delete('/:id', checkPermission('MANAGE_EMAIL_TEMPLATES'), deleteDocumentTemplate);

module.exports = router;
