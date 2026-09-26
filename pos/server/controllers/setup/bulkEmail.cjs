const { pool } = require('../../config/db.cjs');
const { logAction } = require('../../utils/actions.cjs');
const logger = require('../../utils/logger.cjs');
const { replacePlaceholders } = require('../../utils/template.cjs');
const { generateReportBuffer } = require('../../utils/reportGenerator.cjs');
const { escapeHTML } = require('../../utils/html.cjs');
const { getSafeTimezone } = require('../../utils/timezone.cjs');
const { getParsedTemplate } = require('./emailTemplates.cjs');

/**
 * Generic action to send bulk emails using a centralized template.
 * Triggered from Staff or Consumer Management.
 */
const sendBulkEmailAction = async (req, res) => {
    try {
        const { templateKey, recipientIds, type, params = {}, sendToAdmin = false } = req.body;

        if (!templateKey || !recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
            return res.status(400).json({ error: 'Template key and recipients are required' });
        }

        // Pre-send validation: check template config before firing background job
        const template = await getParsedTemplate(templateKey);
        if (template.attachmentSchema) {
            // Attachments are always built from the built-in Excel template for the schema.
            const path = require('path');
            const fs = require('fs');
            const defaultPath = path.join(__dirname, '../../templates/defaults', `${template.attachmentSchema}.xlsx`);
            if (!fs.existsSync(defaultPath)) {
                return res.status(400).json({
                    error: `The email template "${template.label || templateKey}" requires an Excel attachment, but no built-in template exists for "${template.attachmentSchema}".`
                });
            }
        }

        // 1. Immediate response
        res.json({ message: sendToAdmin ? 'Reporting process started. You will receive the email shortly.' : 'Email batch process started in background. You will receive a summary upon completion.' });

        logAction(req.user?.id, req.user?.username, 'BULK_EMAIL_START', `Started bulk email campaign: ${template.label || templateKey} (${recipientIds.length} recipients)`, req.user?.branchId);

        // 2. Background Process
        (async () => {
            try {
                const systemTz = getSafeTimezone();

                // Fetch recipients - SQL Injection Prevention: Whitelist validation
                const VALID_ENTITY_TABLES = { STAFF: 'staff', CONSUMER: 'consumers' };
                const tableName = VALID_ENTITY_TABLES[type];
                if (!tableName) {
                    logger.error('Invalid entity type for scheduled email', { type });
                    return;
                }
                // Filter to only include ACTIVE status for staff
                const statusFilter = type === 'STAFF' ? " AND status = 'ACTIVE'" : '';
                const selectCols = type === 'STAFF'
                    ? 'id, name, email, mobile_number, department, COALESCE(monthly_allowance, 0) AS monthly_allowance, COALESCE(current_balance, 0) AS current_balance'
                    : 'id, name, email, mobile_number, category, COALESCE(opening_balance, 0) AS opening_balance, COALESCE(monthly_allowance, 0) AS monthly_allowance, COALESCE(current_balance, 0) AS current_balance, created_at';
                const result = await pool.query(
                    `SELECT ${selectCols} FROM ${tableName} WHERE id = ANY($1)${statusFilter}`,
                    [recipientIds]
                );
                const recipients = result.rows;

                const results = { sent: 0, failed: 0, errors: [] };
                const { sendEmail } = require('../../email.cjs');

                if (sendToAdmin) {
                    // --- SEND ONE CONSOLIDATED REPORT TO ADMIN ---
                    const configRes = await pool.query("SELECT value FROM system_settings WHERE key = 'email_config'");
                    const config = configRes.rows.length > 0 ? JSON.parse(configRes.rows[0].value) : {};
                    const adminEmail = config.systemAdminRecipient || config.reportRecipient;

                    if (!adminEmail) {
                        logger.error('No admin email configured for report');
                        return;
                    }

                    let attachmentBuffers = [];
                    if (template.attachmentSchema) {
                        let reportData = [];
                        if (['TRANSACTIONS_HISTORY', 'CONSUMPTION_REPORTS', 'INDIVIDUAL_STATEMENT'].includes(template.attachmentSchema)) {
                            // Fetch transactions for ALL recipients aggregated
                            const startDate = params.startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
                            const endDate = params.endDate || new Date().toISOString().split('T')[0];

                            // SQL Injection Prevention: Whitelist validation for field names
                            const VALID_ID_FIELDS = { STAFF: 'staff_id', CONSUMER: 'consumer_id' };
                            const idField = VALID_ID_FIELDS[type];
                            if (!idField) {
                                logger.error('Invalid entity type for transaction query', { type });
                                return;
                            }
                            const txnRes = await pool.query(
                                `SELECT t.*, b.name as branch_name, s.name as entity_name
                                 FROM transactions t
                                 LEFT JOIN branches b ON t.branch_id::text = b.id::text
                                 LEFT JOIN ${tableName} s ON t.${idField}::text = s.id::text
                                 WHERE t.${idField}::text = ANY($1)
                                 AND t.date >= ($2::date AT TIME ZONE '${systemTz}')
                                 AND t.date < (($3::date + INTERVAL '1 day') AT TIME ZONE '${systemTz}')
                                 ORDER BY t.date DESC`,
                                [recipientIds, startDate, endDate]
                            );

                            if (template.attachmentSchema === 'INDIVIDUAL_STATEMENT') {
                                reportData = txnRes.rows.map(t => {
                                    const amount = parseFloat(t.total_amount);
                                    const isSettlement = t.items && t.items.some(i => i.name.toLowerCase().includes('balance settlement'));
                                    return {
                                        'Date': new Date(t.date).toLocaleDateString('en-US', { timeZone: systemTz }),
                                        'Time': new Date(t.date).toLocaleTimeString('en-US', { timeZone: systemTz }),
                                        'Name': t.entity_name || 'N/A',
                                        'Items': t.items ? t.items.map(i => `${i.quantity}x ${i.name}`).join(', ') : '',
                                        'Branch': t.branch_name || 'Unknown',
                                        'Debit (Rs)': !isSettlement ? amount.toFixed(2) : '',
                                        'Credit (Rs)': isSettlement ? amount.toFixed(2) : '',
                                        'Amount (Rs)': amount.toFixed(2),
                                        'Status': t.status || 'COMPLETED',
                                        'Reference': t.reference || '',
                                        'Cashier': t.cashier_name || ''
                                    };
                                });
                            } else {
                                reportData = txnRes.rows.map(t => ({
                                    'Date': new Date(t.date).toLocaleDateString('en-US', { timeZone: systemTz }),
                                    'Time': new Date(t.date).toLocaleTimeString('en-US', { timeZone: systemTz }),
                                    'Entity': t.entity_name || 'N/A',
                                    'Items': t.items ? t.items.map(i => `${i.quantity}x ${i.name}`).join(', ') : '',
                                    'Branch': t.branch_name || 'Unknown',
                                    'Amount': parseFloat(t.total_amount).toFixed(2),
                                    'Status': t.status || 'COMPLETED'
                                }));
                            }
                        } else {
                            // List schemas: Aggregated for all recipients
                            reportData = recipients.map(r => {
                                const m = parseFloat(r.monthly_allowance || 0);
                                const c = parseFloat(r.current_balance || 0);
                                const op = parseFloat(r.opening_balance || 0);
                                const spent = type === 'CONSUMER' ? (op || m) - c : m - c;
                                const payable = c < 0 ? Math.abs(c) : 0;
                                if (type === 'CONSUMER') {
                                    return {
                                        'ID': r.id,
                                        'Name': r.name,
                                        'Email': r.email || '',
                                        'Mobile': r.mobile_number || '',
                                        'Type': r.category || 'Part-time',
                                        'Category': r.category || 'Part-time',
                                        'Monthly Allowance (Rs)': m,
                                        'Current Balance (Rs)': c,
                                        'Total Spent (Rs)': spent,
                                        'Account Payable (Rs)': payable,
                                        'Active Subscriptions': 0,
                                        'Joined Date': r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { timeZone: systemTz }) : ''
                                    };
                                }
                                return {
                                    'ID': r.id,
                                    'Name': r.name,
                                    'Email': r.email || '',
                                    'Mobile': r.mobile_number || '',
                                    'Department': r.department || '',
                                    'Monthly Allowance (Rs)': m,
                                    'Spent (Rs)': spent,
                                    'Payable (Rs)': payable
                                };
                            });
                        }

                        if (reportData.length > 0) {
                            const adminPeriod = params.month
                                ? `${params.month} ${params.year || new Date().getFullYear()}`
                                : (params.startDate && params.endDate ? `${params.startDate} to ${params.endDate}` : '');
                            const buffer = await generateReportBuffer(
                                template.attachmentSchema,
                                reportData,
                                { username: req.user?.username, moduleName: template.label || 'Batch Report', targetPeriod: adminPeriod }
                            );
                            attachmentBuffers.push({
                                filename: `${(template.label || 'Report').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`,
                                content: buffer
                            });
                        }
                    }

                    const subData = {
                        month: params.month || new Date().toLocaleString('en-US', { month: 'long' }),
                        year: new Date().getFullYear().toString(),
                        totalStaff: recipients.length.toString(),
                        totalConsumers: recipients.length.toString(),
                        date: new Date().toLocaleString('en-US', { timeZone: systemTz }),
                        username: req.user?.username || 'Admin'
                    };

                    const subject = replacePlaceholders(template.subject, subData);
                    const html = replacePlaceholders(template.body, subData, false);
                    await sendEmail(adminEmail, subject, html, attachmentBuffers);
                    logger.info(`Consolidated report "${templateKey}" sent to admin ${adminEmail}`);
                    logAction(req.user?.id, req.user?.username, 'BULK_EMAIL_REPORT_SENT', `Consolidated report "${template.label || templateKey}" sent to admin ${adminEmail}`, req.user?.branchId);

                } else {
                    // --- SEND INDIVIDUAL EMAILS TO RECIPIENTS ---
                    const startDate = params.startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
                    const endDate = params.endDate || new Date().toISOString().split('T')[0];

                    for (const recipient of recipients) {
                        try {
                            if (!recipient.email) {
                                results.failed++;
                                results.errors.push(`${recipient.name}: No email`);
                                continue;
                            }

                            // Prepare data for placeholders
                            const data = {
                                ...recipient,
                                ...params,
                                startDate,
                                endDate,
                                date: new Date().toLocaleString('en-US', { timeZone: systemTz }),
                                year: new Date().getFullYear().toString(),
                                totalTransactions: '0',
                                totalAmount: '0.00'
                            };

                            // Add common mapping for POS fields to templates
                            if (recipient.monthly_allowance !== undefined) data.allowance = parseFloat(recipient.monthly_allowance).toFixed(2);
                            if (recipient.current_balance !== undefined) {
                                const bal = parseFloat(recipient.current_balance);
                                data.balance = bal.toFixed(2);
                                if (recipient.monthly_allowance !== undefined) {
                                    data.spent = (parseFloat(recipient.monthly_allowance) - bal).toFixed(2);
                                }
                                data.totalAmount = bal < 0 ? Math.abs(bal).toFixed(2) : '0.00';

                                // Calculate payable alert snippet for the {{payable}} placeholder
                                const payableVal = bal < 0 ? Math.abs(bal) : 0;
                                data.payable = payableVal > 0 ? `
                                    <div style="background-color: #fee2e2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; color: #b91c1c; text-align: center; margin-top: 20px;">
                                        <strong style="display: block; font-size: 16px; margin-bottom: 5px;">Outstanding Payable: Rs. ${payableVal.toFixed(2)}</strong>
                                        <span style="font-size: 12px;">Please settle this amount at the counter.</span>
                                    </div>
                                ` : '';
                            } else {
                                data.payable = '';
                            }
                            data.testAlert = '';

                            const attachments = [];
                            if (template.attachmentSchema) {
                                let reportData = [];

                                // Handle dynamic report data fetching if a date range is relevant
                                if (['TRANSACTIONS_HISTORY', 'CONSUMPTION_REPORTS', 'INDIVIDUAL_STATEMENT'].includes(template.attachmentSchema)) {
                                    // SQL Injection Prevention: Whitelist validation (reuse from above)
                                    const VALID_ID_FIELDS = { STAFF: 'staff_id', CONSUMER: 'consumer_id' };
                                    const idField = VALID_ID_FIELDS[type];
                                    if (!idField) {
                                        logger.error('Invalid entity type for individual transaction query', { type });
                                        continue;
                                    }
                                    const txnRes = await pool.query(
                                        `SELECT t.*, b.name as branch_name
                                     FROM transactions t
                                     LEFT JOIN branches b ON t.branch_id::text = b.id::text
                                     WHERE t.${idField}::text = $1::text
                                     AND t.date >= ($2::date AT TIME ZONE '${systemTz}')
                                     AND t.date < (($3::date + INTERVAL '1 day') AT TIME ZONE '${systemTz}')
                                     ORDER BY t.date DESC`,
                                        [recipient.id, startDate, endDate]
                                    );

                                    data.totalTransactions = txnRes.rows.length.toString();
                                    const totalSum = txnRes.rows.reduce((sum, t) => sum + parseFloat(t.total_amount || 0), 0);
                                    data.totalAmount = totalSum.toFixed(2);

                                    if (template.attachmentSchema === 'INDIVIDUAL_STATEMENT') {
                                        reportData = txnRes.rows.map(t => {
                                            const amount = parseFloat(t.total_amount);
                                            const isSettlement = t.items && t.items.some(i => i.name.toLowerCase().includes('balance settlement'));
                                            return {
                                                'Date': new Date(t.date).toLocaleDateString('en-US', { timeZone: systemTz }),
                                                'Time': new Date(t.date).toLocaleTimeString('en-US', { timeZone: systemTz }),
                                                'Items': t.items ? t.items.map(i => `${i.quantity}x ${i.name}`).join(', ') : '',
                                                'Branch': t.branch_name || 'Unknown',
                                                'Debit (Rs)': !isSettlement ? amount.toFixed(2) : '',
                                                'Credit (Rs)': isSettlement ? amount.toFixed(2) : '',
                                                'Amount (Rs)': amount.toFixed(2),
                                                'Status': t.status || 'COMPLETED',
                                                'Reference': t.reference || '',
                                                'Cashier': t.cashier_name || ''
                                            };
                                        });
                                    } else {
                                        reportData = txnRes.rows.map(t => ({
                                            'Date': new Date(t.date).toLocaleDateString('en-US', { timeZone: systemTz }),
                                            'Time': new Date(t.date).toLocaleTimeString('en-US', { timeZone: systemTz }),
                                            'Items': t.items ? t.items.map(i => `${i.quantity}x ${i.name}`).join(', ') : '',
                                            'Branch': t.branch_name || 'Unknown',
                                            'Amount': parseFloat(t.total_amount).toFixed(2),
                                            'Status': t.status || 'COMPLETED'
                                        }));
                                    }
                                } else {
                                    // Fallback: Individual recipient info for list schemas
                                    reportData = [recipient].map(r => {
                                        const m = parseFloat(r.monthly_allowance || 0);
                                        const c = parseFloat(r.current_balance || 0);
                                        const op = parseFloat(r.opening_balance || 0);
                                        const spent = type === 'CONSUMER' ? (op || m) - c : m - c;
                                        const payable = c < 0 ? Math.abs(c) : 0;
                                        if (type === 'CONSUMER') {
                                            return {
                                                'ID': r.id,
                                                'Name': r.name,
                                                'Email': r.email || '',
                                                'Mobile': r.mobile_number || '',
                                                'Type': r.category || 'Part-time',
                                                'Category': r.category || 'Part-time',
                                                'Monthly Allowance (Rs)': m,
                                                'Current Balance (Rs)': c,
                                                'Total Spent (Rs)': spent,
                                                'Account Payable (Rs)': payable,
                                                'Active Subscriptions': 0,
                                                'Joined Date': r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { timeZone: systemTz }) : ''
                                            };
                                        }
                                        return {
                                            'ID': r.id,
                                            'Name': r.name,
                                            'Email': r.email || '',
                                            'Mobile': r.mobile_number || '',
                                            'Department': r.department || '',
                                            'Monthly Allowance (Rs)': m,
                                            'Spent (Rs)': spent,
                                            'Payable (Rs)': payable
                                        };
                                    });
                                }

                                if (reportData.length > 0) {
                                    const buffer = await generateReportBuffer(
                                        template.attachmentSchema,
                                        reportData,
                                        { username: recipient.name, fullName: recipient.name, moduleName: 'Personal Statement', targetPeriod: params.month ? `${params.month} ${params.year || new Date().getFullYear()}` : (startDate && endDate ? `${startDate} to ${endDate}` : '') }
                                    );

                                    attachments.push({
                                        filename: `Statement_${recipient.name.replace(/\s+/g, '_')}.xlsx`,
                                        content: buffer
                                    });
                                }
                            }

                            const subject = replacePlaceholders(template.subject, data);
                            const html = replacePlaceholders(template.body, data, false); // false = trust internal template HTML

                            const testRecipient = process.env.EMAIL_TEST_RECIPIENT;
                            await sendEmail(testRecipient || recipient.email, subject, html, attachments);
                            results.sent++;

                        } catch (err) {
                            logger.error(`Send failed for ${recipient.email}: ${err.message}`);
                            results.failed++;
                            results.errors.push(`${recipient.name}: ${err.message}`);
                        }

                        // Polite delay
                        await new Promise(r => setTimeout(r, 1500));
                    }

                    // Send Summary to Admin
                    const configRes = await pool.query("SELECT value FROM system_settings WHERE key = 'email_config'");
                    const config = configRes.rows.length > 0 ? JSON.parse(configRes.rows[0].value) : {};
                    const adminEmail = config.systemAdminRecipient || config.reportRecipient;

                    if (adminEmail) {
                        const sumSubject = `Batch Email Summary: ${template.label || templateKey}`;
                        const sumHtml = `
                        <h3>Process Complete</h3>
                        <p>Template: <strong>${template.label || templateKey}</strong></p>
                        <p>Total Targeted: ${recipients.length}</p>
                        <p>Sent Successfully: ${results.sent}</p>
                        <p>Failed: ${results.failed}</p>
                        ${results.errors.length > 0 ? `<div style="color:red">Errors: ${results.errors.map(e => escapeHTML(e)).join('<br>')}</div>` : ''}
                    `;
                        await sendEmail(adminEmail, sumSubject, sumHtml);
                    }
                }

            } catch (bgErr) {
                logger.error('Background email task crashed', bgErr);
            }
        })();

    } catch (error) {
        logger.error('Email Action Error', error);
        res.status(500).json({ error: 'Server error triggering emails' });
    }
};
module.exports = { sendBulkEmailAction };
