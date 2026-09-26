const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const logger = require('../utils/logger.cjs');

// Security: Define available placeholders per template type
const TEMPLATE_PLACEHOLDERS = {
    KOT: [
        '{{branchName}}', '{{orderId}}', '{{orderNumber}}',
        '{{timestamp}}', '{{date}}', '{{time}}', '{{printTime}}',
        '{{staffName}}', '{{staffId}}', '{{customerName}}', '{{consumerId}}',
        '{{items}}', '{{name}}', '{{quantity}}', '{{price}}', '{{itemTotal}}',
        '{{totalAmount}}', '{{paymentMethod}}', '{{orderType}}', '{{transactionType}}',
        '{{cashierName}}'
    ],
    INVOICE: [
        '{{branchName}}', '{{invoiceNumber}}', '{{orderId}}', '{{orderNumber}}',
        '{{date}}', '{{time}}', '{{timestamp}}', '{{printTime}}',
        '{{customerName}}', '{{consumerId}}', '{{staffName}}', '{{cashierName}}',
        '{{items}}', '{{name}}', '{{quantity}}', '{{price}}', '{{itemTotal}}',
        '{{subtotal}}', '{{tax}}', '{{totalAmount}}', '{{paymentMethod}}', '{{transactionType}}'
    ],
    RECEIPT: [
        '{{branchName}}', '{{receiptNumber}}', '{{orderId}}', '{{orderNumber}}',
        '{{date}}', '{{time}}', '{{timestamp}}', '{{printTime}}',
        '{{customerName}}', '{{consumerId}}', '{{staffName}}', '{{cashierName}}',
        '{{items}}', '{{name}}', '{{quantity}}', '{{price}}', '{{itemTotal}}',
        '{{subtotal}}', '{{tax}}', '{{totalAmount}}', '{{paymentMethod}}', '{{transactionType}}'
    ],
    BILL: [
        '{{branchName}}', '{{billNumber}}', '{{orderId}}', '{{orderNumber}}',
        '{{date}}', '{{time}}', '{{timestamp}}', '{{printTime}}',
        '{{customerName}}', '{{consumerId}}', '{{staffName}}', '{{cashierName}}',
        '{{items}}', '{{name}}', '{{quantity}}', '{{price}}', '{{itemTotal}}',
        '{{subtotal}}', '{{tax}}', '{{totalAmount}}', '{{paymentMethod}}', '{{dueAmount}}', '{{transactionType}}'
    ],
    PAYOUT: [
        '{{branchName}}', '{{payoutNumber}}',
        '{{date}}', '{{time}}', '{{timestamp}}', '{{printTime}}',
        '{{recipientName}}', '{{amount}}', '{{reason}}', '{{approvedBy}}', '{{cashierName}}'
    ],
    CUSTOM_ORDER: [
        '{{branchName}}', '{{eventName}}', '{{eventBy}}', '{{staffName}}', '{{cashierName}}',
        '{{date}}', '{{time}}', '{{timestamp}}', '{{printTime}}',
        '{{items}}', '{{name}}', '{{quantity}}', '{{price}}', '{{itemTotal}}', '{{remarks}}',
        '{{totalAmount}}', '{{itemCount}}'
    ]
};

// Strips <script> tags, inline event handlers, and javascript: URIs to prevent XSS
const sanitizeTemplateHTML = (html) => {
    if (!html) return '';
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '');
};

const getDocumentTemplatePlaceholders = async (req, res) => {
    try {
        res.json(TEMPLATE_PLACEHOLDERS);
    } catch (error) {
        logger.error('Error fetching template placeholders', error);
        res.status(500).json({ error: 'Failed to fetch placeholders' });
    }
};

const getDocumentTemplates = async (req, res) => {
    try {
        const { branchId, type } = req.query;
        const userBranchId = req.user?.branchId;

        let query = `
            SELECT
                dt.*,
                b.name as branch_name,
                u.username as created_by_name
            FROM document_templates dt
            LEFT JOIN branches b ON dt.branch_id = b.id
            LEFT JOIN users u ON dt.created_by = u.id
            WHERE dt.is_active = true
        `;
        const params = [];

        // Branch filtering
        if (branchId) {
            params.push(branchId);
            query += ` AND (dt.branch_id = $${params.length} OR dt.branch_id IS NULL)`;
        } else if (userBranchId) {
            params.push(userBranchId);
            query += ` AND (dt.branch_id = $${params.length} OR dt.branch_id IS NULL)`;
        }

        // Type filtering
        if (type) {
            params.push(type.toUpperCase());
            query += ` AND dt.type = $${params.length}`;
        }

        query += ` ORDER BY dt.is_default DESC, (CASE WHEN dt.branch_id IS NOT NULL THEN 1 ELSE 0 END) DESC, dt.created_at DESC`;

        const result = await pool.query(query, params);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching document templates', error);
        res.status(500).json({ error: 'Failed to fetch document templates' });
    }
};

const getDocumentTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const userBranchId = req.user?.branchId;

        const query = `
            SELECT
                dt.*,
                b.name as branch_name,
                u.username as created_by_name
            FROM document_templates dt
            LEFT JOIN branches b ON dt.branch_id = b.id
            LEFT JOIN users u ON dt.created_by = u.id
            WHERE dt.id = $1 AND dt.is_active = true
        `;

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const template = result.rows[0];

        // Admins can access any template; branch users can only access their branch or global templates
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        if (!isAdmin && template.branch_id && template.branch_id !== userBranchId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(template);
    } catch (error) {
        logger.error('Error fetching document template', error);
        res.status(500).json({ error: 'Failed to fetch document template' });
    }
};

const createDocumentTemplate = async (req, res) => {
    try {
        const { name, type, description, template_html, template_css, is_default } = req.body;
        const userId = req.user?.id;
        const userBranchId = req.user?.branchId;

        // Validation
        if (!name || !type || !template_html) {
            return res.status(400).json({ error: 'Name, type, and template_html are required' });
        }

        if (!TEMPLATE_PLACEHOLDERS[type.toUpperCase()]) {
            return res.status(400).json({ error: 'Invalid template type' });
        }

        // SECURITY: Sanitize HTML input
        const sanitizedHTML = sanitizeTemplateHTML(template_html);
        const sanitizedCSS = template_css ? sanitizeTemplateHTML(template_css) : null;

        // Get placeholders for this type
        const placeholders = TEMPLATE_PLACEHOLDERS[type.toUpperCase()] || [];

        const client = await pool.connect();
        let newTemplate;
        try {
            await client.query('BEGIN');

            if (is_default) {
                await client.query(
                    `UPDATE document_templates
                     SET is_default = FALSE
                     WHERE type = $1 AND (branch_id = $2 OR (branch_id IS NULL AND $2 IS NULL))`,
                    [type.toUpperCase(), userBranchId || null]
                );
            }

            const result = await client.query(
                `INSERT INTO document_templates
                 (name, type, description, template_html, template_css, placeholders, branch_id, is_default, created_by, updated_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [name, type.toUpperCase(), description || null, sanitizedHTML, sanitizedCSS,
                 JSON.stringify(placeholders), userBranchId || null, is_default || false, userId, req.user.username]
            );

            await client.query('COMMIT');
            newTemplate = result.rows[0];
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        logAction(userId, req.user.username, 'CREATE_DOCUMENT_TEMPLATE', `Created document template "${newTemplate.name}" (type: ${newTemplate.type})`, userBranchId);
        logger.info(`Document template created: ${newTemplate.id} by ${req.user.username}`);

        res.status(201).json(newTemplate);
    } catch (error) {
        logger.error('Error creating document template', error);
        res.status(500).json({ error: 'Failed to create document template' });
    }
};

const updateDocumentTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, description, template_html, template_css, is_default, is_active } = req.body;
        const userId = req.user?.id;
        const userBranchId = req.user?.branchId;

        // Fetch existing template (optimized: only fetch needed columns)
        const existingResult = await pool.query(
            `SELECT id, name, type, description, template_html, template_css,
                    branch_id, is_default, is_active, created_by
             FROM document_templates WHERE id = $1`,
            [id]
        );

        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const existingTemplate = existingResult.rows[0];

        // Security: Check if user has access to this template
        if (existingTemplate.branch_id && userBranchId && existingTemplate.branch_id !== userBranchId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (type && !TEMPLATE_PLACEHOLDERS[type.toUpperCase()]) {
            return res.status(400).json({ error: 'Invalid template type' });
        }

        const sanitizedHTML = template_html ? sanitizeTemplateHTML(template_html) : existingTemplate.template_html;
        const sanitizedCSS = template_css !== undefined ? sanitizeTemplateHTML(template_css) : existingTemplate.template_css;

        const finalType = type?.toUpperCase() || existingTemplate.type;
        const placeholders = TEMPLATE_PLACEHOLDERS[finalType] || [];

        const client = await pool.connect();
        let updatedTemplate;
        try {
            await client.query('BEGIN');

            if (is_default) {
                await client.query(
                    `UPDATE document_templates
                     SET is_default = FALSE
                     WHERE type = $1 AND id != $2 AND (branch_id = $3 OR (branch_id IS NULL AND $3 IS NULL))`,
                    [finalType, id, existingTemplate.branch_id]
                );
            }

            const result = await client.query(
                `UPDATE document_templates
                 SET name = $1, type = $2, description = $3, template_html = $4,
                     template_css = $5, placeholders = $6, is_default = $7,
                     is_active = $8, updated_by = $9, updated_at = NOW()
                 WHERE id = $10
                 RETURNING *`,
                [
                    name || existingTemplate.name,
                    finalType,
                    description !== undefined ? description : existingTemplate.description,
                    sanitizedHTML,
                    sanitizedCSS,
                    JSON.stringify(placeholders),
                    is_default !== undefined ? is_default : existingTemplate.is_default,
                    is_active !== undefined ? is_active : existingTemplate.is_active,
                    req.user.username,
                    id,
                ]
            );

            await client.query('COMMIT');
            updatedTemplate = result.rows[0];
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        logAction(userId, req.user.username, 'UPDATE_DOCUMENT_TEMPLATE', `Updated document template "${updatedTemplate.name}" (ID: ${id})`, userBranchId);
        logger.info(`Document template updated: ${id} by ${req.user.username}`);

        res.json({
            message: 'Template updated successfully',
            template: updatedTemplate,
            metadata: {
                updatedBy: req.user.username,
                updatedAt: updatedTemplate.updated_at
            }
        });
    } catch (error) {
        logger.error('Error updating document template', error);
        res.status(500).json({ error: 'Failed to update document template' });
    }
};

const deleteDocumentTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const userBranchId = req.user?.branchId;

        // Fetch existing template (optimized: only fetch needed columns)
        const existingResult = await pool.query(
            `SELECT id, name, branch_id, is_default, is_active
             FROM document_templates WHERE id = $1`,
            [id]
        );

        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const existingTemplate = existingResult.rows[0];

        // Security: Check if user has access to this template
        if (existingTemplate.branch_id && userBranchId && existingTemplate.branch_id !== userBranchId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Prevent deletion of default system templates
        if (existingTemplate.is_default && !existingTemplate.branch_id) {
            return res.status(400).json({ error: 'Cannot delete default system template' });
        }

        // Soft delete (set is_active to false)
        await pool.query(
            'UPDATE document_templates SET is_active = FALSE, updated_by = $1, updated_at = NOW() WHERE id = $2',
            [req.user.username, id]
        );

        // Audit log
        logAction(userId, req.user.username, 'DELETE_DOCUMENT_TEMPLATE', `Deleted document template "${existingTemplate.name}" (ID: ${id})`, userBranchId);

        logger.info(`Document template deleted: ${id} by ${req.user.username}`);

        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        logger.error('Error deleting document template', error);
        res.status(500).json({ error: 'Failed to delete document template' });
    }
};

module.exports = {
    getDocumentTemplates,
    getDocumentTemplate,
    createDocumentTemplate,
    updateDocumentTemplate,
    deleteDocumentTemplate,
    getDocumentTemplatePlaceholders
};
