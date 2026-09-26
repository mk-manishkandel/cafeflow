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

const getSelfServiceTransactions = async (req, res) => {
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
    const { page = 1, limit = 20, filterBranchId } = req.query;

    try {
        const currentBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [resolvedBranchId]);
        const isMainBranch = currentBranchRes.rows[0]?.name === 'Main Branch';

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const offset = (pageNum - 1) * limitNum;

        let whereClause = "WHERE t.order_source = 'SELF_SERVICE'";
        const params = [];

        if (!isMainBranch) {
            whereClause += ' AND t.branch_id = $1';
            params.push(resolvedBranchId);
        } else if (filterBranchId) {
            whereClause += ' AND t.branch_id = $1';
            params.push(filterBranchId);
        }

        const countQuery = `
            SELECT COUNT(*) as total
            FROM transactions t
            JOIN branches b ON t.branch_id = b.id
            ${whereClause}
        `;
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].total);

        let query = `
            SELECT t.id, t.total_amount, t.date, t.status, t.payment_method, t.recipient_name, t.items, b.name as branch_name
            FROM transactions t
            JOIN branches b ON t.branch_id = b.id
            ${whereClause}
            ORDER BY t.date DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        const result = await pool.query(query, [...params, limitNum, offset]);

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
        logger.error('Error fetching self-service transactions:', err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
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

        emitEvent('fnb:activity', { type: 'session_created', branchId }, branchId);

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({ sessionId: result.rows[0].id });
    } catch (err) {
        logger.error('Error creating FnB session:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
};

const logFnBActivity = async (req, res) => {
    const { sessionId, action, metadata } = req.body;

    // SEC-C3: Validate action against an allowlist
    const ALLOWED_ACTIONS = [
        'view_menu', 'add_to_cart', 'remove_from_cart', 'update_quantity',
        'initiate_checkout', 'checkout_success', 'checkout_failed',
        'session_started', 'session_ended', 'page_view', 'payment_initiated',
        'payment_confirmed', 'payment_failed', 'order_placed'
    ];
    if (!action || !ALLOWED_ACTIONS.includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }

    // SEC-C3 / SEC-M6: Validate sessionId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!sessionId || !uuidRegex.test(sessionId)) {
        return res.status(400).json({ error: 'Invalid sessionId' });
    }

    // SEC-C3: Cap metadata to 1024 bytes
    let safeMetadata = metadata || {};
    const metaStr = JSON.stringify(safeMetadata);
    if (metaStr.length > 1024) {
        return res.status(400).json({ error: 'metadata exceeds maximum allowed size' });
    }

    try {
        // SEC-C3: Verify sessionId belongs to an active session before writing
        const sessionCheck = await pool.query(
            "SELECT branch_id FROM fnb_sessions WHERE id = $1 AND status != 'ABANDONED'",
            [sessionId]
        );
        if (sessionCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired session' });
        }
        const branchId = sessionCheck.rows[0].branch_id;

        await pool.query(
            'INSERT INTO fnb_activity_logs (session_id, action, metadata) VALUES ($1, $2, $3)',
            [sessionId, action, safeMetadata]
        );

        // SEC-H7: Only emit whitelisted fields — never emit raw user-supplied metadata
        if (branchId) {
            emitEvent('fnb:activity', { type: 'log_created', action, timestamp: new Date().toISOString(), sessionId }, branchId);
        }

        res.json({ success: true });
    } catch (err) {
        logger.error('Error logging FnB activity:', err);
        res.status(500).json({ error: 'Failed to log activity' });
    }
};

const getFnBActivityLogs = async (req, res) => {
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
    const { page = 1, limit = 50, sessionId, filterBranchId } = req.query;

    try {
        const currentBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [resolvedBranchId]);
        const isMainBranch = currentBranchRes.rows[0]?.name === 'Main Branch';

        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 50;
        const offset = (pageNum - 1) * limitNum;

        let query = `
            SELECT l.*, s.branch_id, s.ip_address, s.user_agent, b.name as branch_name
            FROM fnb_activity_logs l
            JOIN fnb_sessions s ON l.session_id = s.id
            JOIN branches b ON s.branch_id = b.id
        `;
        const params = [];
        let whereClauses = [];

        if (!isMainBranch) {
            whereClauses.push(`s.branch_id = $${params.length + 1}`);
            params.push(resolvedBranchId);
        } else if (filterBranchId) {
            whereClauses.push(`s.branch_id = $${params.length + 1}`);
            params.push(filterBranchId);
        }

        if (sessionId) {
            whereClauses.push(`l.session_id = $${params.length + 1}`);
            params.push(sessionId);
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        const countQuery = `SELECT COUNT(*) FROM (${query}) AS logs_count`;
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count);

        query += ' ORDER BY l.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);

        const result = await pool.query(query, [...params, limitNum, offset]);

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
        logger.error('Error fetching FnB activity logs:', err);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
};

module.exports = {
    getSelfServiceStatus,
    toggleBranchStatus,
    toggleItemStatus,
    toggleItemsStatus,
    getSelfServiceTransactions,
    createFnBSession,
    logFnBActivity,
    getFnBActivityLogs
};
