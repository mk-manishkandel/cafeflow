const { pool } = require('../../config/db.cjs');
const { logAction } = require('../../utils/actions.cjs');
const logger = require('../../utils/logger.cjs');
const { sendTestEmail } = require('../../email.cjs');
const { decrypt, encrypt } = require('../../utils/encryption.cjs');

const getEmailConfig = async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM system_settings WHERE key = 'email_config'");
        const email = result.rows.length > 0 ? JSON.parse(result.rows[0].value) : {};

        res.json({
            host: email.host || '',
            port: email.port || 587,
            user: email.user || '',
            pass: email.pass ? '********' : '',
            from: email.from || '',
            reportRecipient: email.reportRecipient || '',
            systemAdminRecipient: email.systemAdminRecipient || '',
            secure: !!email.secure
        });
    } catch (error) {
        logger.error('Error fetching email config', error);
        res.status(500).json({ error: 'Failed' });
    }
};

const updateEmailConfig = async (req, res) => {
    try {
        const { host, port, user, pass, from, secure, reportRecipient, systemAdminRecipient } = req.body;

        const result = await pool.query("SELECT value FROM system_settings WHERE key = 'email_config'");
        const oldEmail = result.rows.length > 0 ? JSON.parse(result.rows[0].value) : {};

        let newPass = pass;
        if (pass === '********') {
            newPass = oldEmail.pass; // Already encrypted, use as-is
        }

        const emailConfig = {
            host,
            port,
            user,
            pass: pass === '********' ? newPass : encrypt(newPass),
            from,
            reportRecipient,
            systemAdminRecipient,
            secure
        };

        await pool.query(`
            INSERT INTO system_settings (key, value)
            VALUES ('email_config', $1)
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [JSON.stringify(emailConfig)]);

        logger.info(`Email configuration updated by ${req.user.username}`);
        res.json({ message: 'Email settings saved successfully' });

    } catch (error) {
        logger.error('Error updating email settings', error);
        res.status(500).json({ error: 'Failed to update email settings' });
    }
};
const testEmailConfig = async (req, res) => {
    try {
        const { host, port, user, pass, from, secure, reportRecipient } = req.body;

        if (!reportRecipient) {
            return res.status(400).json({ error: 'System Notification Recipient is required for testing' });
        }

        let newPass = pass;
        if (pass === '********') {
            const result = await pool.query("SELECT value FROM system_settings WHERE key = 'email_config'");
            if (result.rows.length > 0) {
                const email = JSON.parse(result.rows[0].value);
                newPass = decrypt(email.pass);
            }
        }

        const config = { host, port, user, pass: newPass, from, secure };
        await sendTestEmail(config, reportRecipient);

        logAction(req.user?.id, req.user?.username, 'TEST_EMAIL_CONFIG', `Sent test email to ${reportRecipient}`, req.user?.branchId);

        res.json({ message: `Test email sent successfully to ${reportRecipient}!` });
    } catch (error) {
        logger.error('Test email failed', error);
        res.status(500).json({ error: 'Test failed: ' + error.message });
    }
};
module.exports = { getEmailConfig, updateEmailConfig, testEmailConfig };
