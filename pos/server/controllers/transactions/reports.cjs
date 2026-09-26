const { ROLES } = require('../../utils/roleHierarchy.cjs');
const { pool } = require('../../config/db.cjs');
const { logAction } = require('../../utils/actions.cjs');
const logger = require('../../utils/logger.cjs');
const { buildTransactionFilters } = require('../../utils/queryBuilder.cjs');
const { getSafeTimezone } = require('../../utils/timezone.cjs');
const { generateReportBuffer } = require('../../utils/reportGenerator.cjs');

// getCellText removed in favor of centralized utility in reportGenerator.cjs

// applyTemplate removed in favor of centralized generateReportBuffer

const exportTransactions = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const systemTz = getSafeTimezone();

        const { whereClause, params } = buildTransactionFilters({ ...req.query }, req.user);

        const result = await pool.query(`
            SELECT t.id, t.date, t.order_source AS type, t.total_amount AS amount, t.payment_method, t.status,
                   COALESCE(s.name, c.name, t.recipient_name, 'N/A') AS entity_name,
                   u.username as cashier_name
            FROM transactions t
            LEFT JOIN staff s ON t.staff_id = s.id::text
            LEFT JOIN consumers c ON t.consumer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            ${whereClause} ORDER BY t.date DESC LIMIT 10000
        `, params);

        const data = result.rows.map(t => ({
            'ID': t.id,
            'Date': new Date(t.date).toLocaleString('en-US', { timeZone: systemTz }),
            'Type': t.type,
            'Entity': t.entity_name,
            'Amount (Rs)': Math.abs(parseFloat(t.amount)),
            'Payment Method': t.payment_method || '',
            'Status': t.status || '',
            'Reference': t.id,
            'Cashier': t.cashier_name || 'System'
        }));

        const buffer = await generateReportBuffer('TRANSACTIONS_HISTORY', data, {
            username: req.user?.username,
            moduleName: 'Transactions History'
        });

        logAction(req.user?.id, req.user?.username, 'EXPORT_TRANSACTIONS', `Exported Transaction History (Dates: ${startDate || 'All'} to ${endDate || 'All'})`, req.user?.branchId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="transactions_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        logger.error('Error exporting transactions:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const exportConsumption = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const systemTz = getSafeTimezone();

        const { whereClause, params } = buildTransactionFilters({ ...req.query, reportType: 'consumption' }, req.user);

        const result = await pool.query(`
            SELECT t.id AS order_id, t.date, COALESCE(s.name, c.name, t.recipient_name, 'Unknown') AS customer_name,
                   COALESCE(c.category, 'Individual') AS customer_type,
                   t.total_amount, t.payment_method, t.items,
                   u.username as cashier_name
            FROM transactions t
            LEFT JOIN staff s ON t.staff_id = s.id::text
            LEFT JOIN consumers c ON t.consumer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            ${whereClause} ORDER BY t.date DESC LIMIT 10000
        `, params);

        const data = result.rows.map(r => {
            let itemsArr = [];
            try { itemsArr = (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) || []; } catch (e) { logger.warn('Failed to parse transaction items', { items: r.items, error: e.message }); }
            const totalItems = itemsArr.reduce((acc, it) => acc + (parseInt(it.quantity) || 0), 0);
            const itemsString = itemsArr.map(it => `${it.quantity}x ${it.name}`).join(', ');
            return {
                'Order ID': r.order_id,
                'Date': new Date(r.date).toLocaleString('en-US', { timeZone: systemTz }),
                'Customer Name': r.customer_name,
                'Customer Type': r.customer_type,
                'Items': itemsString,
                'Total Items': totalItems,
                'Total Paid (Rs)': parseFloat(r.total_amount) || 0,
                'Payment Method': r.payment_method || '',
                'Cashier': r.cashier_name || 'System'
            };
        });

        const buffer = await generateReportBuffer('CONSUMPTION_REPORTS', data, {
            username: req.user?.username,
            moduleName: 'F&B Consumption Summary'
        });

        logAction(req.user?.id, req.user?.username, 'EXPORT_CONSUMPTION', `Exported Consumption Summary (Dates: ${startDate || 'All'} to ${endDate || 'All'})`, req.user?.branchId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="consumption_report_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        logger.error('Error exporting consumption summary:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const exportItemAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const branchId = isAdmin ? (req.query.branchId || null) : (req.user?.branchId || null);
        const result = await pool.query(`
            SELECT
                item_name AS item,
                item_category AS category,
                SUM(total_quantity) AS quantity_sold,
                SUM(total_revenue) AS gross_revenue,
                SUM(total_revenue) AS net_revenue
            FROM mv_item_sales_summary
            WHERE (branch_id = $1 OR $1 IS NULL)
              AND (sales_date >= $2::date OR $2 IS NULL)
              AND (sales_date <= $3::date OR $3 IS NULL)
            GROUP BY item_name, item_category
            ORDER BY net_revenue DESC LIMIT 1000
        `, [branchId, startDate || null, endDate || null]);

        const data = result.rows.map(r => ({
            'Item': r.item,
            'Category': r.category || 'Uncategorized',
            'Quantity Sold': parseInt(r.quantity_sold) || 0,
            'Gross Revenue (Rs)': parseFloat(r.gross_revenue) || 0,
            'Net Revenue (Rs)': parseFloat(r.net_revenue) || 0
        }));

        const buffer = await generateReportBuffer('ITEM_ANALYTICS', data, {
            username: req.user?.username,
            moduleName: 'Item Analytics'
        });

        logAction(req.user?.id, req.user?.username, 'EXPORT_ANALYTICS', `Exported Item Analytics (Dates: ${startDate || 'All'} to ${endDate || 'All'})`, req.user?.branchId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="item_analytics_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        logger.error('Error exporting item analytics:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
module.exports = { exportTransactions, exportConsumption, exportItemAnalytics };
