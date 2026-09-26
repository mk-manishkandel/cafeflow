const nodemailer = require('nodemailer');
const { pool } = require('./config/db.cjs');
const { decrypt } = require('./utils/encryption.cjs');
const logger = require('./utils/logger.cjs');

const getEmailConfig = async () => {
    try {
        const res = await pool.query("SELECT value FROM system_settings WHERE key = 'email_config'");
        if (res.rows.length > 0) {
            const customConfig = JSON.parse(res.rows[0].value);
            const decryptedPass = decrypt(customConfig.pass);
            if (!decryptedPass) {
                throw new Error('SMTP password decryption failed. Please re-save your email configuration in Business Setup.');
            }
            return {
                host: customConfig.host,
                port: customConfig.port || 587,
                secure: customConfig.secure || false,
                auth: {
                    user: customConfig.user,
                    pass: decryptedPass,
                },
                from: customConfig.from,
                reportRecipient: customConfig.reportRecipient,
                systemAdminRecipient: customConfig.systemAdminRecipient
            };
        }
    } catch (e) {
        logger.error('Failed to fetch email config from DB', e);
    }

    return {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        from: process.env.SMTP_FROM,
        reportRecipient: process.env.SYSTEM_NOTIFICATION_EMAIL,
        systemAdminRecipient: process.env.SYSTEM_ADMIN_EMAIL
    };
};

/**
 * Validates SMTP configuration fields before creating a nodemailer transport.
 * Throws a descriptive error if any required field is invalid.
 * @param {object} config - The SMTP config object.
 */
const validateSmtpConfig = (config) => {
    if (!config.host || typeof config.host !== 'string' || config.host.trim() === '') {
        throw new Error('SMTP validation failed: host is required and must be a non-empty string');
    }
    const host = config.host.trim();
    if (host !== 'localhost' && !host.includes('.')) {
        throw new Error(`SMTP validation failed: host "${host}" does not appear to be a valid hostname (must contain a dot or be "localhost")`);
    }

    const port = parseInt(config.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`SMTP validation failed: port "${config.port}" must be a number between 1 and 65535`);
    }

    if (!config.auth || typeof config.auth !== 'object') {
        throw new Error('SMTP validation failed: auth object is required');
    }
    if (!config.auth.user || typeof config.auth.user !== 'string' || config.auth.user.trim() === '') {
        throw new Error('SMTP validation failed: auth.user is required and must be a non-empty string');
    }
    if (!config.auth.pass || typeof config.auth.pass !== 'string' || config.auth.pass.trim() === '') {
        throw new Error('SMTP validation failed: auth.pass is required and must be a non-empty string');
    }
};

const createTransporter = (config = null) => {
    if (!config) {
        // This is a problem since createTransporter is usually expected to be synchronous
        // or we need to pass config to it from an async caller.
        throw new Error('Config must be provided to createTransporter');
    }

    if (!config.host) {
        logger.warn('SMTP not configured. Emails will not be sent.');
        return null;
    }

    try {
        validateSmtpConfig(config);
    } catch (validationErr) {
        logger.error('SMTP configuration validation failed', { error: validationErr.message });
        throw validationErr;
    }

    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth
    });
};

const sendEmail = async (to, subject, html, attachments = []) => {
    try {
        const config = await getEmailConfig();
        const transporter = createTransporter(config);

        if (!transporter) {
            throw new Error('Email configuration missing');
        }

        const info = await transporter.sendMail({
            from: config.from,
            to,
            subject,
            html,
            attachments,
        });

        return info;
    } catch (err) {
        logger.error('sendEmail failed', { to, subject, error: err.message });
        throw err;
    }
};

const sendTestEmail = async (config, to) => {
    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.pass
        }
    });

    await transporter.verify();

    const info = await transporter.sendMail({
        from: config.from,
        to: to,
        subject: 'MK POS - Test Email',
        html: `
            <h3>Email Configuration Test</h3>
            <p>This is a test email from your POS system.</p>
            <p>If you received this, your email configuration is working correctly! ✅</p>
            <br>
            <p>Time: ${new Date().toLocaleString('en-US', { timeZone: process.env.TZ || 'UTC' })}</p>
        `
    });

    return info;
};

module.exports = { sendEmail, getEmailConfig, sendTestEmail };
