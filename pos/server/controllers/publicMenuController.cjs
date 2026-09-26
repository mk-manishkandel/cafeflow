const { pool } = require('../config/db.cjs');
const logger = require('../utils/logger.cjs');

/**
 * Returns branches that have self-service enabled (student ordering app).
 */
const getPublicBranches = async (req, res) => {
    try {
        const query = "SELECT id, name FROM branches WHERE is_self_service_enabled = true AND is_active = true AND name != 'Main Branch' ORDER BY name ASC";
        const result = await pool.query(query);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(result.rows);
    } catch (err) {
        logger.error('Error fetching public branches:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Returns today's menu items for the student ordering app.
 * Filters to is_today_menu=true; includes branchName for display.
 */
const getStudentTodayMenu = async (req, res) => {
    const { branchId } = req.query;
    try {
        let query = `
            SELECT m.id, m.name, m.price, m.category, m.image, m.branch_id, b.name AS branch_name
            FROM menu m
            JOIN branches b ON m.branch_id = b.id
            WHERE m.is_self_service = true
            AND m.available = true
            AND m.is_deleted = false
            AND b.is_self_service_enabled = true
            AND b.is_active = true
            AND b.name != 'Main Branch'
        `;
        const params = [];

        if (branchId) {
            query += ' AND m.branch_id = $1';
            params.push(branchId);
        }

        query += ' ORDER BY b.name, m.category, m.name';

        const result = await pool.query(query, params);

        const items = result.rows.map(row => ({
            id: row.id.toString(),
            name: row.name,
            price: parseFloat(row.price),
            category: row.category || '',
            image: row.image,
            branchId: row.branch_id ? row.branch_id.toString() : null,
            branchName: row.branch_name
        }));

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json(items);
    } catch (err) {
        logger.error('Error fetching student today menu:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getPublicBranches,
    getStudentTodayMenu
};
