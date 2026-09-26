const { ROLES } = require('../../utils/roleHierarchy.cjs');
const { pool, query } = require('../../config/db.cjs');
const { cacheGet, cacheSet } = require('../../redis.cjs');
const logger = require('../../utils/logger.cjs');
const { buildTransactionFilters } = require('../../utils/queryBuilder.cjs');
const { getMainBranchId } = require('./shared.cjs');

// Helpers for Reports
const handleItemSalesReport = async (req, res, branchId, startDate, endDate, userType, whereClause, params) => {
    const cacheKey = `report:item_sales:${branchId || 'all'}:${startDate || 'all'}:${endDate || 'all'}:${userType || 'all'}`;
    const cachedData = await cacheGet(cacheKey);
    if (cachedData) return res.json(cachedData);

    const aggQuery = `
        SELECT 
            item_name,
            item_category as category,
            COALESCE(b.name, 'Unknown') as branch_name,
            m.branch_id,
            total_quantity as quantity,
            total_revenue
        FROM mv_item_sales_summary m
        LEFT JOIN branches b ON m.branch_id = b.id
        WHERE (m.branch_id = $1 OR $1 IS NULL)
          AND (m.sales_date >= $2::date OR $2 IS NULL)
          AND (m.sales_date <= $3::date OR $3 IS NULL)
        ORDER BY total_revenue DESC
    `;
    // Note: This assumes buildTransactionFilters logic is simplified or replaced for MV.
    // For now, let's keep it simple as the above query is much faster.
    // If Admin selects 'Main Branch', treat as system-wide (NULL filter)
    let effectiveBranchId = branchId;
    const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;
    if (isAdmin && effectiveBranchId) {
        if (effectiveBranchId === await getMainBranchId()) {
            effectiveBranchId = null;
        }
    }

    const aggResult = await pool.query(aggQuery, [effectiveBranchId, startDate, endDate]);

    const responseData = {
        data: aggResult.rows.map(row => ({
            id: `${row.item_name}_${row.branch_id}`,
            itemName: row.item_name,
            category: row.category || 'Uncategorized',
            branchName: row.branch_name,
            branchId: row.branch_id,
            quantity: parseInt(row.quantity),
            totalRevenue: parseFloat(row.total_revenue),
            averagePrice: parseInt(row.quantity) > 0 ? parseFloat(row.total_revenue) / parseInt(row.quantity) : 0
        }))
    };

    try { await cacheSet(cacheKey, responseData, 300); } catch (e) { logger.warn('Failed to cache transactions', e); }
    return res.json(responseData);
};

const getTransactions = async (req, res) => {
    let { branchId, startDate, endDate, limit = 100, page, userType, reportType } = req.query;
    const isAdmin = req.user.role?.toLowerCase() === ROLES.ADMIN;
    const userBranchId = req.user.branchId;

    // If Admin selects 'Main Branch', treat as system-wide (NULL filter)
    if (isAdmin && branchId) {
        if (branchId === await getMainBranchId()) {
            branchId = null;
        }
    }

    // Enforce branch isolation for non-admins before building filters or running reports
    if (!isAdmin && userBranchId) {
        branchId = userBranchId;
    }

    try {
        const { whereClause, params } = buildTransactionFilters({ ...req.query, branchId }, req.user);

        if (reportType === 'item_sales') {
            return await handleItemSalesReport(req, res, branchId, startDate, endDate, userType, whereClause, params);
        }

        let baseQuery = `
            SELECT t.*, 
                   b.name as branch_name, 
                   COALESCE(s.name, t.recipient_name) as staff_name,
                   c.name as consumer_name,
                   s.department as staff_department,
                   u.username as cashier_name
            FROM transactions t
            LEFT JOIN branches b ON t.branch_id = b.id AND b.is_active = true
            LEFT JOIN staff s ON t.staff_id = s.id::text
            LEFT JOIN consumers c ON t.consumer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
        `;

        if (page) {
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 200);
            const offset = (pageNum - 1) * limitNum;

            const countQuery = `
                SELECT COUNT(*) as total, SUM(t.total_amount) as total_amount_sum
                FROM transactions t
                LEFT JOIN staff s ON t.staff_id = s.id::text
                LEFT JOIN consumers c ON t.consumer_id = c.id
                ${whereClause}
            `;
            const countRes = await query(countQuery, params);
            const total = parseInt(countRes.rows[0].total);
            const totalAmountSum = parseFloat(countRes.rows[0].total_amount_sum || 0);

            const aggregates = { totalAmount: totalAmountSum };
            const result = await query(`${baseQuery} ${whereClause} ORDER BY t.date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limitNum, offset]);

            return res.json({
                data: result.rows.map(mapTransactionRow),
                pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
                aggregates
            });
        }

        const result = await query(`${baseQuery} ${whereClause} ORDER BY t.date DESC LIMIT $${params.length + 1}`, [...params, limit]);
        return res.json(result.rows.map(mapTransactionRow));

    } catch (err) {
        logger.error('Get transactions error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const mapTransactionRow = (row) => ({
    id: row.id,
    staffId: row.staff_id,
    consumerId: row.consumer_id,
    staffName: row.staff_name || row.consumer_name || 'Unknown',
    totalAmount: parseFloat(row.total_amount),
    timestamp: row.date,
    status: row.status,
    items: row.items,
    branchId: row.branch_id,
    branchName: row.branch_name,
    paymentMethod: row.payment_method,
    orderSource: row.order_source || null,
    cashierName: row.cashier_name || 'System',
    refundMethod: row.refund_method || null
});
module.exports = { getTransactions };
