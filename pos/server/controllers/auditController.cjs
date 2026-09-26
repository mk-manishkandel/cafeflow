const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const logger = require('../utils/logger.cjs');
const { generateReportBuffer } = require('../utils/reportGenerator.cjs');
const { getSafeTimezone } = require('../utils/timezone.cjs');

const getAuditLogs = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);
    const { search, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    try {
        const params = [];
        let conditions = [];

        if (req.user?.role?.toLowerCase() !== ROLES.ADMIN && req.user?.branchId) {
            params.push(req.user.branchId);
            conditions.push(`branch_id = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conditions.push(`(
                user_name ILIKE $${i} OR 
                action ILIKE $${i} OR 
                details ILIKE $${i} OR
                branch_id ILIKE $${i}
            )`);
        }

        if (startDate) {
            params.push(startDate);
            const tz = getSafeTimezone();
            conditions.push(`timestamp >= ($${params.length}::date AT TIME ZONE '${tz}' AT TIME ZONE 'UTC')`);
        }
        if (endDate) {
            params.push(endDate);
            const tz = getSafeTimezone();
            conditions.push(`timestamp < (($${params.length}::date + INTERVAL '1 day') AT TIME ZONE '${tz}' AT TIME ZONE 'UTC')`);
        }

        const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

        const query = `SELECT * FROM audit_logs${whereClause} ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const finalParams = [...params, limit, offset];

        const [result, countRes] = await Promise.all([
            pool.query(query, finalParams),
            pool.query(`SELECT COUNT(*) FROM audit_logs${whereClause}`, params)
        ]);

        res.json({
            data: result.rows,
            pagination: {
                total: parseInt(countRes.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(parseInt(countRes.rows[0].count) / limit)
            }
        });
    } catch (err) {
        logger.error('Get audit logs error', err);
        res.status(500).json({ error: 'Database error' });
    }
};



// getCellText removed in favor of centralized utility in reportGenerator.cjs

const exportAuditLogs = async (req, res) => {
    try {
        const { startDate, endDate, search } = req.query;
        const systemTz = getSafeTimezone();

        const params = [];
        const conditions = [];

        if (req.user?.role?.toLowerCase() !== ROLES.ADMIN && req.user?.branchId) {
            params.push(req.user.branchId);
            conditions.push(`branch_id = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conditions.push(`(
                user_name ILIKE $${i} OR 
                action ILIKE $${i} OR 
                details ILIKE $${i} OR
                branch_id ILIKE $${i}
            )`);
        }

        if (startDate) {
            params.push(startDate);
            conditions.push(`timestamp >= ($${params.length}::date AT TIME ZONE '${systemTz}')`);
        }
        if (endDate) {
            params.push(endDate);
            conditions.push(`timestamp < (($${params.length}::date + INTERVAL '1 day') AT TIME ZONE '${systemTz}')`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(`SELECT timestamp, user_name, action, details, branch_id FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT 10000`, params);

        const data = result.rows.map(r => ({
            'Timestamp': new Date(r.timestamp).toLocaleString('en-US', { timeZone: systemTz }),
            'User Name': r.user_name || '',
            'Action': r.action || '',
            'Details': r.details || '',
            'Branch ID': r.branch_id || ''
        }));

        const buffer = await generateReportBuffer('AUDIT_LOGS', data, {
            username: req.user?.username,
            moduleName: 'Audit Logs'
        });

        logAction(req.user?.id, req.user?.username, 'EXPORT_AUDIT_LOGS', `Exported Audit Logs (Dates: ${startDate || 'All'} to ${endDate || 'All'})`, req.user?.branchId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        logger.error('Error exporting audit logs:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const createAuditLog = async (req, res) => {
    const { action, details } = req.body;
    if (!action) return res.status(400).json({ error: 'Action is required' });
    try {
        await require('../utils/actions.cjs').logAction(req.user?.id, req.user?.username, action, details || '', req.user?.branchId);
        res.json({ success: true });
    } catch (err) {
        logger.error('Create audit log error', err);
        res.status(500).json({ error: 'Failed to create log' });
    }
};

module.exports = { getAuditLogs, createAuditLog, exportAuditLogs };
