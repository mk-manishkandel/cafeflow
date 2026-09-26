const { pool } = require('../../config/db.cjs');
const { logAction } = require('../../utils/actions.cjs');
const logger = require('../../utils/logger.cjs');

// Default content for all system-required email templates.
// These are auto-seeded into system_settings on first fetch if missing,
// ensuring every new deployment has template data without manual SQL.
const DEFAULT_TEMPLATES = {
    email_template_admin_report: {
        label: 'Monthly Admin Summary',
        subject: 'Monthly Staff Report - {{month}} {{year}}',
        body: '<h2 style="color:#333">Monthly Staff Report</h2><p>Dear Admin,</p><p>Please find the monthly staff consumption report for <strong>{{month}} {{year}}</strong> attached below.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Staff:</strong></td><td style="padding:8px;border:1px solid #ddd">{{totalStaff}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Transactions:</strong></td><td style="padding:8px;border:1px solid #ddd">{{totalTransactions}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Amount:</strong></td><td style="padding:8px;border:1px solid #ddd">Rs. {{totalAmount}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Generated On:</strong></td><td style="padding:8px;border:1px solid #ddd">{{date}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>',
        description: 'Sends a summarized Excel report of all staff consumption for the month to the System Administrator.',
        placeholders: ['{{month}}', '{{year}}', '{{totalStaff}}', '{{totalTransactions}}', '{{totalAmount}}', '{{date}}'],
        attachmentSchema: 'STAFF_LIST'
    },
    email_template_staff_reset: {
        label: 'Staff Reset Confirmation (Admin)',
        subject: 'Staff Allowance Reset Notification - {{month}} {{year}}',
        body: '<h2 style="color:#333">Allowance Reset Notification</h2><p>Dear Admin,</p><p>Staff allowances have been reset for <strong>{{month}} {{year}}</strong>.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Performed By:</strong></td><td style="padding:8px;border:1px solid #ddd">{{username}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Staff Reset:</strong></td><td style="padding:8px;border:1px solid #ddd">{{totalStaff}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Reset Amount:</strong></td><td style="padding:8px;border:1px solid #ddd">Rs. {{resetAmount}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Reset Date:</strong></td><td style="padding:8px;border:1px solid #ddd">{{resetDate}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>System Date:</strong></td><td style="padding:8px;border:1px solid #ddd">{{date}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>',
        description: 'Sent to administrators as a receipt when the Monthly Allowance Reset process is performed for staff.',
        placeholders: ['{{month}}', '{{year}}', '{{username}}', '{{totalStaff}}', '{{resetAmount}}', '{{resetDate}}', '{{date}}']
    },
    email_template_consumer_reset: {
        label: 'Consumer Reset Confirmation (Admin)',
        subject: 'Consumer Allowance Reset Notification - {{month}} {{year}}',
        body: '<h2 style="color:#333">Consumer Allowance Reset</h2><p>Dear Admin,</p><p>Consumer allowances have been successfully reset for <strong>{{month}} {{year}}</strong>.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Performed By:</strong></td><td style="padding:8px;border:1px solid #ddd">{{username}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Consumers Reset:</strong></td><td style="padding:8px;border:1px solid #ddd">{{totalConsumers}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Reset Amount:</strong></td><td style="padding:8px;border:1px solid #ddd">Rs. {{resetAmount}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Reset Date:</strong></td><td style="padding:8px;border:1px solid #ddd">{{resetDate}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>System Date:</strong></td><td style="padding:8px;border:1px solid #ddd">{{date}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>',
        description: 'Sent to administrators as a receipt when the Monthly Allowance Reset process is performed for consumers.',
        placeholders: ['{{month}}', '{{year}}', '{{username}}', '{{totalConsumers}}', '{{resetAmount}}', '{{resetDate}}', '{{date}}']
    },
    email_template_consumer_aggregate_report: {
        label: 'Monthly Admin Summary',
        subject: 'Consumer Aggregate Report - {{month}} {{year}}',
        body: '<h2 style="color:#333">Consumer Aggregate Report</h2><p>Dear Admin,</p><p>Please find the aggregated consumer consumption report for <strong>{{month}} {{year}}</strong> attached below.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Consumers:</strong></td><td style="padding:8px;border:1px solid #ddd">{{totalConsumers}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Generated On:</strong></td><td style="padding:8px;border:1px solid #ddd">{{date}}</td></tr></table><br><p>Regards,<br>CafeFlow POS System</p>',
        description: 'Sends a summarized Excel report of all consumer consumption for the month to the System Administrator.',
        placeholders: ['{{month}}', '{{year}}', '{{totalConsumers}}', '{{date}}'],
        attachmentSchema: 'CONSUMER_LIST'
    },
    email_template_staff_bulk_import: {
        label: 'Staff Import Summary (Admin)',
        subject: 'Staff Bulk Import Summary - {{date}}',
        body: '<h2 style="color:#333">Staff Bulk Import Complete</h2><p>Dear Admin,</p><p>The staff bulk import operation has been completed on <strong>{{date}}</strong>.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Performed By:</strong></td><td style="padding:8px;border:1px solid #ddd">{{username}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Imported:</strong></td><td style="padding:8px;border:1px solid #ddd">{{totalImported}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Successful:</strong></td><td style="padding:8px;border:1px solid #ddd">{{successCount}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Failed:</strong></td><td style="padding:8px;border:1px solid #ddd">{{failCount}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Error Summary:</strong></td><td style="padding:8px;border:1px solid #ddd">{{errorCount}} errors found</td></tr></table>{{errorList}}<br><p>Regards,<br>CafeFlow POS System</p>',
        description: 'Summary report sent to admins after an Excel bulk import of staff members is processed.',
        placeholders: ['{{date}}', '{{username}}', '{{totalImported}}', '{{successCount}}', '{{failCount}}', '{{errorCount}}', '{{errorList}}']
    },
    email_template_monthly_statement: {
        label: 'Monthly Statement',
        subject: 'Your Monthly Statement - {{month}} {{year}}',
        body: '{{testAlert}}<h2 style="color:#333">Monthly Consumption Statement</h2><p>Dear {{name}},</p><p>Please find your personal consumption statement for <strong>{{month}} {{year}}</strong> attached.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Period:</strong></td><td style="padding:8px;border:1px solid #ddd">{{startDate}} to {{endDate}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Staff Email:</strong></td><td style="padding:8px;border:1px solid #ddd">{{email}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Department:</strong></td><td style="padding:8px;border:1px solid #ddd">{{department}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Monthly Allowance:</strong></td><td style="padding:8px;border:1px solid #ddd">Rs. {{allowance}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Spent:</strong></td><td style="padding:8px;border:1px solid #ddd">Rs. {{spent}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Remaining Balance:</strong></td><td style="padding:8px;border:1px solid #ddd">Rs. {{balance}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Transactions:</strong></td><td style="padding:8px;border:1px solid #ddd">{{totalTransactions}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Payable Amount:</strong></td><td style="padding:8px;border:1px solid #ddd">Rs. {{totalAmount}}</td></tr></table>{{payable}}<br><p>If you have any questions, please contact the administrator.</p><p>Regards,<br>CafeFlow POS System</p>',
        description: 'Personalized monthly consumption report sent directly to individual staff members.',
        placeholders: ['{{name}}', '{{email}}', '{{department}}', '{{allowance}}', '{{spent}}', '{{balance}}', '{{payable}}', '{{month}}', '{{year}}', '{{startDate}}', '{{endDate}}', '{{totalTransactions}}', '{{totalAmount}}', '{{testAlert}}', '{{date}}'],
        attachmentSchema: 'CONSUMPTION_REPORTS'
    },
    email_template_statement_attachment: {
        label: 'Individual Statement',
        subject: 'Account Statement - {{startDate}} to {{endDate}}',
        body: '<h2 style="color:#333">Account Statement</h2><p>Dear {{name}},</p><p>Please find your account statement for the period <strong>{{startDate}}</strong> to <strong>{{endDate}}</strong> attached to this email.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Account:</strong></td><td style="padding:8px;border:1px solid #ddd">{{email}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Transactions:</strong></td><td style="padding:8px;border:1px solid #ddd">{{totalTransactions}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Amount:</strong></td><td style="padding:8px;border:1px solid #ddd">Rs. {{totalAmount}}</td></tr></table><br><p>For any queries, please contact the administrator.</p><p>Copyright &copy; {{year}} CafeFlow POS</p>',
        description: 'Used for sending transaction-by-transaction details to a staff or consumer upon request.',
        placeholders: ['{{name}}', '{{email}}', '{{startDate}}', '{{endDate}}', '{{totalTransactions}}', '{{totalAmount}}', '{{year}}', '{{date}}'],
        attachmentSchema: 'INDIVIDUAL_STATEMENT'
    },
    email_template_bulk_statement_completion: {
        label: 'Bulk Send Summary (Admin)',
        subject: 'Bulk Statement Sending Complete - {{date}}',
        body: '<h2 style="color:#333">Bulk Statement Sending Complete</h2><p>Dear Admin,</p><p>The bulk statement sending job for <strong>{{month}}</strong> completed on <strong>{{date}}</strong>.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px;border:1px solid #ddd"><strong>Total Recipients:</strong></td><td style="padding:8px;border:1px solid #ddd">{{total}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Successfully Sent:</strong></td><td style="padding:8px;border:1px solid #ddd">{{sent}}</td></tr><tr><td style="padding:8px;border:1px solid #ddd"><strong>Failed:</strong></td><td style="padding:8px;border:1px solid #ddd">{{failed}}</td></tr></table><br><h4>Error Logs:</h4><p>{{errors}}</p><br><p>Regards,<br>CafeFlow POS System</p>',
        description: 'A completion report sent to admins showing the result of a batch email campaign.',
        placeholders: ['{{month}}', '{{date}}', '{{total}}', '{{sent}}', '{{failed}}', '{{errors}}']
    }
};

/**
 * Fetches an email template from system_settings, parses it, 
 * and falls back to DEFAULT_TEMPLATES if missing.
 * @param {string} key - The template key (e.g., 'email_template_admin_report')
 * @returns {Promise<Object>} { subject, body, placeholders }
 */
const getParsedTemplate = async (key) => {
    try {
        const result = await pool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
        if (result.rows.length > 0) {
            const template = JSON.parse(result.rows[0].value);
            delete template.attachmentTemplateId; // custom Excel templates were removed
            // Sync placeholders with code-defined source of truth for system templates
            if (DEFAULT_TEMPLATES[key]) {
                template.placeholders = DEFAULT_TEMPLATES[key].placeholders;
                // Preserve attachment settings from DB if present, otherwise use default
                template.attachmentSchema = template.attachmentSchema || DEFAULT_TEMPLATES[key].attachmentSchema;
            }
            return template;
        }
    } catch (err) {
        logger.error(`Error fetching template ${key}`, err);
    }
    return DEFAULT_TEMPLATES[key] || { subject: 'Template Missing', body: '', placeholders: [] };
};


const getEmailTemplates = async (req, res) => {
    try {
        const result = await pool.query("SELECT key, value, updated_at FROM system_settings WHERE key LIKE 'email_template%'");
        const templates = {};
        result.rows.forEach(row => {
            const parsedValue = JSON.parse(row.value);
            delete parsedValue.attachmentTemplateId; // custom Excel templates were removed
            // Force code-defined placeholders for system templates in the UI
            if (DEFAULT_TEMPLATES[row.key]) {
                parsedValue.label = DEFAULT_TEMPLATES[row.key].label; // Force code-defined label
                parsedValue.placeholders = DEFAULT_TEMPLATES[row.key].placeholders;
                parsedValue.attachmentSchema = parsedValue.attachmentSchema || DEFAULT_TEMPLATES[row.key].attachmentSchema;
            }
            templates[row.key] = {
                ...parsedValue,
                updatedAt: parsedValue.updatedAt || row.updated_at,
                updatedBy: parsedValue.updatedBy || 'System'
            };
        });

        // Auto-seed any missing default templates so new deployments self-heal
        const missingKeys = Object.keys(DEFAULT_TEMPLATES).filter(k => !templates[k]);
        if (missingKeys.length > 0) {
            const insertPromises = missingKeys.map(key =>
                pool.query(
                    `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
                    [key, JSON.stringify(DEFAULT_TEMPLATES[key])]
                ).then(() => {
                    templates[key] = DEFAULT_TEMPLATES[key];
                })
            );
            await Promise.all(insertPromises);
            logger.info(`Auto-seeded ${missingKeys.length} missing email template(s): ${missingKeys.join(', ')}`);
        }

        res.json(templates);
    } catch (error) {
        logger.error('Error fetching email templates', error);
        res.status(500).json({ error: 'Failed' });
    }
};

const updateEmailTemplate = async (req, res) => {
    try {
        const { key, template } = req.body;
        if (!key || !template) {
            return res.status(400).json({ error: 'Key and template are required' });
        }

        const metadata = {
            updatedBy: req.user.username,
            updatedAt: new Date().toISOString()
        };

        const templateWithMetadata = { ...template, ...metadata };

        await pool.query(`
            INSERT INTO system_settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
        `, [key, JSON.stringify(templateWithMetadata)]);

        logger.info(`Email template ${key} updated by ${req.user.username}`);
        res.json({ message: 'Template saved successfully', metadata });
    } catch (error) {
        logger.error('Error updating email template', error);
        res.status(500).json({ error: 'Failed to update email template' });
    }
};

const testEmailTemplate = async (req, res) => {
    try {
        const { template } = req.body;
        if (!template || !template.subject || !template.body) {
            return res.status(400).json({ error: 'Subject and body are required' });
        }

        const { getEmailConfig, sendEmail } = require('../../email.cjs');
        const { replacePlaceholders } = require('../../utils/template.cjs');
        const config = await getEmailConfig();
        const recipient = config.systemAdminRecipient || config.reportRecipient;

        if (!recipient) {
            return res.status(400).json({ error: 'System Admin Recipient not configured in Email Settings' });
        }

        // Generate dummy data for placeholders
        const testData = {};
        if (template.placeholders && Array.isArray(template.placeholders)) {
            template.placeholders.forEach(p => {
                const key = p.replace(/[{}]/g, '');
                testData[key] = `[Test ${key}]`;
            });
        }

        // Add some common defaults if not present
        const now = new Date();
        const commonData = {
            month: now.toLocaleString('en-US', { month: 'long' }),
            year: now.getFullYear().toString(),
            date: now.toLocaleDateString(),
            username: req.user?.username || 'TestAdmin',
            name: 'Test User'
        };
        const finalData = { ...commonData, ...testData };

        const subject = replacePlaceholders(`[TEST] ${template.subject}`, finalData);
        const html = replacePlaceholders(template.body, finalData, false); // false to keep it as raw HTML

        const attachments = [];
        if (template.attachmentSchema) {
            attachments.push({
                filename: `test_attachment.csv`,
                content: 'Test,Data\nPlaceholder,Attachment',
                contentType: 'text/csv'
            });
        }

        await sendEmail(recipient, subject, html, attachments);

        logAction(req.user?.id, req.user?.username, 'TEST_EMAIL_TEMPLATE', `Tested email template: ${template.label || 'Unknown'}`, req.user?.branchId);

        res.json({ message: `Test email sent successfully to ${recipient}${attachments.length ? ' with dummy attachment' : ''}` });
    } catch (error) {
        logger.error('Error sending test email template', error);
        res.status(500).json({ error: 'Failed to send test email: ' + error.message });
    }
};

const deleteEmailTemplate = async (req, res) => {
    try {
        const { key } = req.params;
        const systemKeys = [
            'email_template_admin_report',
            'email_template_staff_reset',
            'email_template_consumer_reset',
            'email_template_consumer_aggregate_report',
            'email_template_staff_bulk_import',
            'email_template_monthly_statement',
            'email_template_statement_attachment',
            'email_template_bulk_statement_completion'
        ];

        if (systemKeys.includes(key)) {
            return res.status(400).json({ error: 'Cannot delete system-required email templates' });
        }

        await pool.query("DELETE FROM system_settings WHERE key = $1", [key]);

        logger.info(`Email template ${key} deleted by ${req.user.username}`);
        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        logger.error('Error deleting email template', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
};
module.exports = { getParsedTemplate, getEmailTemplates, updateEmailTemplate, testEmailTemplate, deleteEmailTemplate };
