const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const logger = require('../utils/logger.cjs');

const getLedgerEntries = async (req, res) => {
    try {
        const { entityType, entityId, limit = 50, page = 1 } = req.query;
        const { branchId, role } = req.user;
        const isAdmin = role?.toLowerCase() === ROLES.ADMIN;

        if (!entityType || !entityId) {
            return res.status(400).json({ error: 'Missing entityType or entityId' });
        }

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 50;
        const offset = (pageNum - 1) * limitNum;

        const params = [entityType.toUpperCase(), entityId];
        let conditions = ['entity_type = $1', 'entity_id = $2'];

        // ENFORCE BRANCH ISOLATION:
        // 1. Non-admins with a specific branch are restricted to that branch
        // 2. Non-admins with null branchId have "Global / All Branches" scope — no filter applied
        // 3. Admins can see everything
        if (!isAdmin) {
            if (!branchId && branchId !== null) return res.status(403).json({ error: 'Access Denied: No branch assigned' });
            if (branchId) {
                params.push(branchId);
                conditions.push(`branch_id = $${params.length}`);
            }
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const balanceTable = entityType.toUpperCase() === 'STAFF' ? 'staff' : 'consumers';
        const [result, countRes, balanceResult] = await Promise.all([
            pool.query(
                `SELECT * FROM financial_ledger
                 ${whereClause}
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limitNum, offset]
            ),
            pool.query(`SELECT COUNT(*) FROM financial_ledger ${whereClause}`, params),
            pool.query(`SELECT current_balance FROM ${balanceTable} WHERE id = $1`, [entityId])
        ]);
        const currentBalance = balanceResult.rows[0]?.current_balance || 0;

        res.json({
            data: result.rows,
            pagination: {
                total: parseInt(countRes.rows[0].count),
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(parseInt(countRes.rows[0].count) / limitNum)
            },
            currentBalance: parseFloat(currentBalance)
        });
    } catch (err) {
        logger.error('Get ledger entries error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const { getSafeTimezone } = require('../utils/timezone.cjs');
const { generateReportBuffer } = require('../utils/reportGenerator.cjs');

const exportIndividualStatement = async (req, res) => {
    try {
        const { entityType, entityId } = req.query;
        const { branchId, role } = req.user;
        const isAdmin = role?.toLowerCase() === ROLES.ADMIN;

        if (!entityType || !entityId) {
            return res.status(400).json({ error: 'Missing entityType or entityId' });
        }

        const params = [entityType.toUpperCase(), entityId];
        let conditions = ['entity_type = $1', 'entity_id = $2'];

        if (!isAdmin) {
            if (!branchId && branchId !== null) return res.status(403).json({ error: 'Access Denied' });
            if (branchId) {
                params.push(branchId);
                conditions.push(`branch_id = $${params.length}`);
            }
        }

        const whereClause = 'WHERE ' + conditions.join(' AND ');
        const result = await pool.query(
            `SELECT fl.*, b.name as branch_name 
             FROM financial_ledger fl
             LEFT JOIN branches b ON fl.branch_id = b.id
             ${whereClause} 
             ORDER BY fl.created_at ASC`,
            params
        );

        const systemTz = getSafeTimezone();

        const data = result.rows.map(row => ({
            'Date': new Date(row.created_at).toLocaleDateString('en-US', { timeZone: systemTz }),
            'Time': new Date(row.created_at).toLocaleTimeString('en-US', { timeZone: systemTz }),
            'Items': row.reason || 'Transaction',
            'Branch': row.branch_name || 'System',
            'Type': row.type || 'UNKNOWN',
            'Debit (Rs)': row.type === 'DEBIT' ? parseFloat(row.amount) : 0,
            'Credit (Rs)': row.type === 'CREDIT' ? parseFloat(row.amount) : 0,
            // DB-M9: REFUND entries are shown as negative credit (funds returned to entity)
            'Refund (Rs)': row.type === 'REFUND' ? parseFloat(row.amount) : 0,
            'Amount (Rs)': parseFloat(row.amount),
            'Status': row.type === 'REFUND' ? 'REFUNDED' : 'COMPLETED',
            'Reference': row.reference_id || 'N/A',
            'Cashier': 'System'
        }));

        const buffer = await generateReportBuffer('INDIVIDUAL_STATEMENT', data, {
            username: req.user?.username,
            moduleName: 'Individual Account Statement'
        });

        logAction(req.user?.id, req.user?.username, 'EXPORT_STATEMENT', `Exported Individual Statement for ${entityType} ${entityId}`, req.user?.branchId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="statement_${entityId}_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        logger.error('Export individual statement error', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getLedgerEntries,
    exportIndividualStatement
};
