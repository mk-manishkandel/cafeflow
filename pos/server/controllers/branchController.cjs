const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const { cacheGet, cacheSet, cacheInvalidatePattern, CACHE_TTL } = require('../redis.cjs');
const { emitEvent } = require('../socket.cjs');
const logger = require('../utils/logger.cjs');

const getBranches = async (req, res) => {
    try {
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
        const offset = (page - 1) * limit;
        const paginated = req.query.page !== undefined || req.query.limit !== undefined;

        // Only use cache for non-paginated requests (full list)
        if (!paginated) {
            const cacheKey = isAdmin ? 'branches:admin' : 'branches:staff';
            const cached = await cacheGet(cacheKey);
            if (cached) return res.json(cached);

            const branchQuery = isAdmin
                ? "SELECT * FROM branches WHERE is_active = true ORDER BY name"
                : "SELECT * FROM branches WHERE is_active = true AND name != 'Main Branch' ORDER BY name";

            const result = await pool.query(branchQuery);
            await cacheSet(cacheKey, result.rows, CACHE_TTL.BRANCHES);
            return res.json(result.rows);
        }

        // Paginated path
        const baseWhere = isAdmin
            ? "WHERE is_active = true"
            : "WHERE is_active = true AND name != 'Main Branch'";

        const countRes = await pool.query(`SELECT COUNT(*) FROM branches ${baseWhere}`);
        const total = parseInt(countRes.rows[0].count);

        const result = await pool.query(
            `SELECT * FROM branches ${baseWhere} ORDER BY name LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error('Get branches error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const createBranch = async (req, res) => {
    const { name, address } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO branches (name, address) VALUES ($1, $2) RETURNING *',
            [name, address]
        );
        logAction(req.user?.id, req.user?.username, 'CREATE_BRANCH', `Created branch ${name}`, req.user?.branchId);
        await cacheInvalidatePattern('branches:all');
        emitEvent('data:updated', { type: 'branch' });
        res.json(result.rows[0]);
    } catch (err) {
        logger.error('Create branch error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const updateBranch = async (req, res) => {
    const { id } = req.params;
    const { name, address, is_self_service_enabled } = req.body;
    try {
        await pool.query(
            'UPDATE branches SET name = $1, address = $2, is_self_service_enabled = $3 WHERE id = $4',
            [name, address, is_self_service_enabled, id]
        );
        await cacheInvalidatePattern('branches:*');
        emitEvent('data:updated', { type: 'branch' });
        res.json({ success: true });
    } catch (err) {
        logger.error('Update branch error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const deleteBranch = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        // Check if trying to delete Main Branch (super admin branch)
        const branchCheck = await client.query('SELECT name FROM branches WHERE id = $1', [id]);
        if (branchCheck.rows.length > 0 && branchCheck.rows[0].name === 'Main Branch') {
            client.release();
            return res.status(403).json({ error: 'Cannot delete Main Branch. It is the system default branch.' });
        }

        await client.query('BEGIN');
        // Soft-delete the branch
        await client.query('UPDATE branches SET is_active = false WHERE id = $1', [id]);
        // Cascade soft-delete to related tables
        await client.query('UPDATE menu SET available = false WHERE branch_id = $1', [id]);
        await client.query('UPDATE payment_methods SET is_active = false WHERE branch_id = $1', [id]);
        await client.query('COMMIT');

        await cacheInvalidatePattern('branches:all');
        emitEvent('data:updated', { type: 'branch' });
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Delete branch error', err);
        if (err.code === '23503') {
            return res.status(409).json({ error: 'Cannot delete branch because it has associated data (Users, Staff, or Transactions). Please remove associated data first.' });
        }
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
};

module.exports = {
    getBranches,
    createBranch,
    updateBranch,
    deleteBranch
};
