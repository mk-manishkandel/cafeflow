const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool } = require('../config/db.cjs');
const { cacheInvalidatePattern } = require('../redis.cjs');
const logger = require('../utils/logger.cjs');
const { emitEvent } = require('../socket.cjs');

const getSelfServiceStatus = async (req, res) => {
    const { branchId: userBranchId } = req.user;

    // RBAC-M8: Admin users with no branchId assigned have no implicit self-service scope.
    // Require an explicit branchId query param so they operate on a specific branch.
    if (!userBranchId && req.user.role?.toLowerCase() === ROLES.ADMIN) {
        const scopedBranchId = req.query.branchId;
        if (!scopedBranchId) {
            return res.status(400).json({ error: 'branchId required for self-service scope' });
        }
        // Re-invoke with the scoped branchId by patching req.user for this call
        req.user = { ...req.user, branchId: scopedBranchId };
    }

    const resolvedBranchId = req.user.branchId;

    try {
        // Fetch Main Branch ID and current branch status concurrently
        const [mainRes, currentRes] = await Promise.all([
            pool.query("SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1"),
            pool.query('SELECT name, is_self_service_enabled FROM branches WHERE id = $1 AND is_active = true', [resolvedBranchId])
        ]);

        const mainBranchId = mainRes.rows[0]?.id;

        // Check if operating from the Main Branch context
        const isMainBranch = resolvedBranchId === mainBranchId;

        const currentBranch = currentRes.rows[0];

        let menuQuery = `
            SELECT m.id, m.name, m.category, m.price, m.image, m.is_self_service, m.branch_id, b.name as branch_name
            FROM menu m
            JOIN branches b ON m.branch_id = b.id
            WHERE m.available = true
            AND m.is_deleted = false
            AND b.is_active = true
            AND b.name != 'Main Branch'
        `;
        const params = [];

        if (!isMainBranch) {
            menuQuery += ' AND m.branch_id = $1';
            params.push(resolvedBranchId);
        }

        menuQuery += ' ORDER BY b.name, m.category, m.name';
        const menuRes = await pool.query(menuQuery, params);

        let branchStatuses = [];
        if (isMainBranch) {
            // Exclude management branch (Main Branch) by ID and show only active branches
            const branchesRes = await pool.query("SELECT id, name, is_self_service_enabled FROM branches WHERE id != $1 AND is_active = true ORDER BY name", [mainBranchId]);
            branchStatuses = branchesRes.rows.map(b => ({
                id: b.id,
                name: b.name,
                isEnabled: b.is_self_service_enabled
            }));
        } else if (currentBranch) {
            // For branch-isolated view, show only current branch in statuses
            branchStatuses = [{
                id: resolvedBranchId,
                name: currentBranch.name,
                isEnabled: currentBranch.is_self_service_enabled
            }];
        }

        res.json({
            isSelfServiceEnabled: currentBranch?.is_self_service_enabled,
            branchName: currentBranch?.name,
            isMainBranch,
            branchStatuses,
            menuItems: menuRes.rows.map(row => ({
                id: row.id,
                name: row.name,
                category: row.category,
                price: parseFloat(row.price) || 0,
                image: row.image,
                isSelfService: row.is_self_service,
                branchName: row.branch_name,
                branchId: row.branch_id
            }))
        });
    } catch (err) {
        logger.error('Error fetching self-service status:', err);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
};

const toggleBranchStatus = async (req, res) => {
    const { branchId: userBranchId } = req.user;
    const { enabled, branchId: targetBranchId } = req.body;
    try {
        let mainBranchId;
        let isMainBranchUserContext; // This variable will reflect if the user is operating as if from Main Branch

        if (!userBranchId && req.user.role?.toLowerCase() === ROLES.ADMIN) {
            // If userBranchId is missing but user is admin, fetch Main Branch ID
            const mainRes = await pool.query("SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1");
            mainBranchId = mainRes.rows[0]?.id;
            isMainBranchUserContext = true;
        } else if (userBranchId) {
            const currentBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [userBranchId]);
            isMainBranchUserContext = currentBranchRes.rows[0]?.name === 'Main Branch';
            // If user's branch is Main Branch, we might need its ID later
            if (isMainBranchUserContext) {
                const mainRes = await pool.query("SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1");
                mainBranchId = mainRes.rows[0]?.id;
            }
        } else {
            // Neither admin with missing branchId nor a regular user with branchId
            // This case should ideally not happen if authentication is robust, but handle defensively
            return res.status(403).json({ error: 'Unauthorized: Missing branch context' });
        }

        // Robust check: fallback to Main Branch if user is Admin but missing branchId
        const isMainBranch = isMainBranchUserContext;

        // Main Branch users can toggle any branch if targetBranchId is provided
        const finalBranchId = (isMainBranch && targetBranchId) ? targetBranchId : (userBranchId || mainBranchId);

        if (!finalBranchId) {
            return res.status(400).json({ error: 'Cannot determine target branch for update.' });
        }

        await pool.query('UPDATE branches SET is_self_service_enabled = $1 WHERE id = $2', [enabled, finalBranchId]);
        await cacheInvalidatePattern('branches:*');
        emitEvent('data:updated', { type: 'branches' });
        res.json({ success: true, enabled, branchId: finalBranchId });
    } catch (err) {
        logger.error('Error toggling branch status:', err);
        res.status(500).json({ error: 'Failed to update branch status' });
    }
};

const toggleItemStatus = async (req, res) => {
    const { branchId: userBranchId } = req.user;

    // RBAC-M8: Admin users with no branchId must supply an explicit branchId query param.
    if (!userBranchId && req.user.role?.toLowerCase() === ROLES.ADMIN) {
        const scopedBranchId = req.body.branchId;
        if (!scopedBranchId) {
            return res.status(400).json({ error: 'branchId required for self-service scope' });
        }
        req.user = { ...req.user, branchId: scopedBranchId };
    }

    const resolvedBranchId = req.user.branchId;
    const { itemId, enabled } = req.body;
    try {
        const currentBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [resolvedBranchId]);
        const isMainBranch = currentBranchRes.rows[0]?.name === 'Main Branch';

        let query = 'UPDATE menu SET is_self_service = $1 WHERE id = $2';
        const params = [enabled, itemId];

        if (!isMainBranch) {
            query += ' AND branch_id = $3';
            params.push(resolvedBranchId);
        }

        await pool.query(query, params);
        await cacheInvalidatePattern('menu:*');
        await cacheInvalidatePattern('dashboard:*');
        emitEvent('data:updated', { type: 'menu' }, resolvedBranchId);
        res.json({ success: true, enabled });
    } catch (err) {
        logger.error('Error toggling item status:', err);
        res.status(500).json({ error: 'Failed to update item status' });
    }
};

const toggleItemsStatus = async (req, res) => {
    const { branchId: userBranchId } = req.user;

    // RBAC-M8: Admin users with no branchId must supply an explicit branchId query param.
    if (!userBranchId && req.user.role?.toLowerCase() === ROLES.ADMIN) {
        const scopedBranchId = req.body.branchId;
        if (!scopedBranchId) {
            return res.status(400).json({ error: 'branchId required for self-service scope' });
        }
        req.user = { ...req.user, branchId: scopedBranchId };
    }

    const resolvedBranchId = req.user.branchId;
    const { itemIds, isSelfService } = req.body;
    if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > 500) return res.status(400).json({ error: 'itemIds must be a non-empty array with at most 500 elements' });
    if (!itemIds.every(id => typeof id === 'string' && id.trim().length > 0)) {
        return res.status(400).json({ error: 'All itemIds must be non-empty strings' });
    }

    try {
        const currentBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [resolvedBranchId]);
        const isMainBranch = currentBranchRes.rows[0]?.name === 'Main Branch';

        let query = 'UPDATE menu SET is_self_service = $1 WHERE id::text = ANY($2)';
        const params = [isSelfService, itemIds];

        if (!isMainBranch) {
            query += ' AND branch_id = $3';
            params.push(resolvedBranchId);
        }

        await pool.query(query, params);
        await cacheInvalidatePattern('menu:*');
        await cacheInvalidatePattern('dashboard:*');
        emitEvent('data:updated', { type: 'menu' }, resolvedBranchId);
        res.json({ success: true });
    } catch (err) {
        logger.error('Error toggling items status:', err);
        res.status(500).json({ error: 'Failed to update items status' });
    }
};

const STUDENT_ORDER_STATUSES = ['PENDING', 'LOADED_TO_POS', 'COMPLETED', 'CANCELLED'];

// Student pre-orders placed through the student ordering app, newest first.
// Optional filters: status, search (order ID or student email), filterBranchId
// (Main Branch only).
const getStudentOrders = async (req, res) => {
    const { branchId: userBranchId } = req.user;

    // RBAC-M8: Admin users with no branchId must supply an explicit branchId query param.
    if (!userBranchId && req.user.role?.toLowerCase() === ROLES.ADMIN) {
        const scopedBranchId = req.query.branchId;
        if (!scopedBranchId) {
            return res.status(400).json({ error: 'branchId required for self-service scope' });
        }
        req.user = { ...req.user, branchId: scopedBranchId };
    }

    const resolvedBranchId = req.user.branchId;
    const { page = 1, limit = 20, filterBranchId, status, search } = req.query;

    if (status && !STUDENT_ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const currentBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [resolvedBranchId]);
        const isMainBranch = currentBranchRes.rows[0]?.name === 'Main Branch';

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
        const offset = (pageNum - 1) * limitNum;

        const whereClauses = [];
        const params = [];

        if (!isMainBranch) {
            params.push(resolvedBranchId);
            whereClauses.push(`o.branch_id = $${params.length}`);
        } else if (filterBranchId) {
            params.push(filterBranchId);
            whereClauses.push(`o.branch_id = $${params.length}`);
        }
        if (status) {
            params.push(status);
            whereClauses.push(`o.status = $${params.length}`);
        }
        if (typeof search === 'string' && search.trim()) {
            params.push(`%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
            whereClauses.push(`(o.id ILIKE $${params.length} OR o.student_email ILIKE $${params.length})`);
        }

        const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countRes = await pool.query(
            `SELECT COUNT(*) AS total FROM student_orders o ${whereClause}`,
            params
        );
        const total = parseInt(countRes.rows[0].total);

        const result = await pool.query(
            `SELECT o.id, o.student_email, o.items, o.total_amount, o.status,
                    o.created_at, o.loaded_at, o.completed_at, b.name AS branch_name
             FROM student_orders o
             LEFT JOIN branches b ON o.branch_id = b.id
             ${whereClause}
             ORDER BY o.created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limitNum, offset]
        );

        res.json({
            data: result.rows,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        logger.error('Error fetching student orders:', err);
        res.status(500).json({ error: 'Failed to fetch student orders' });
    }
};

const createFnBSession = async (req, res) => {
    const { branchId } = req.body;

    const ipAddress = req.realIp;
    const userAgent = req.headers['user-agent'];

    // Basic UUID validation to prevent database errors on malformed input (e.g. "undefined")
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!branchId || !uuidRegex.test(branchId)) {
        logger.warn(`Invalid branchId provided for session creation: ${branchId}`);
        return res.status(400).json({ error: 'Valid Branch ID is required' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO fnb_sessions (branch_id, ip_address, user_agent) VALUES ($1, $2, $3) RETURNING id',
            [branchId, ipAddress, userAgent]
        );

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({ sessionId: result.rows[0].id });
    } catch (err) {
        logger.error('Error creating FnB session:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
};

module.exports = {
    getSelfServiceStatus,
    toggleBranchStatus,
    toggleItemStatus,
    toggleItemsStatus,
    getStudentOrders,
    createFnBSession
};
