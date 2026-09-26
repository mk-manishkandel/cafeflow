const bcrypt = require('bcryptjs');
const { pool } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const { emitEvent, emitToUser } = require('../socket.cjs');
const logger = require('../utils/logger.cjs');
const { ROLES, getRoleLevel, isAdmin } = require('../utils/roleHierarchy.cjs');
const { invalidateUserRoleCache } = require('../middleware/auth.cjs');

const CANONICAL_PERMISSIONS = new Set([
    '*', // Wildcard — full access (used for super-admin roles)
    // POS & Transactions
    'ACCESS_POS',
    'TRANSACTION_VIEW', 'TRANSACTION_REFUND', 'TRANSACTION_EDIT',
    'TRANSACTION_DELETE', 'TRANSACTION_EXPORT',
    // Dashboard & Reports
    'VIEW_DASHBOARD', 'VIEW_REPORTS', 'VIEW_ITEM_SALES_REPORT',
    'EXPORT_REPORTS', 'VIEW_AUDIT_LOGS', 'MANAGE_AUDIT_LOGS',
    // Menu
    'MENU_VIEW', 'MENU_ADD_ITEM', 'MENU_EDIT_ITEM', 'MENU_DELETE_ITEM',
    'MENU_MANAGE_CATEGORIES', 'MENU_BULK_IMPORT',
    // Staff
    'STAFF_VIEW', 'STAFF_ADD', 'STAFF_EDIT', 'STAFF_DELETE',
    'STAFF_RESET', 'STAFF_BULK_IMPORT', 'STAFF_SEND_NOTIFICATION', 'STAFF_SEND_STATEMENT',
    // Consumer
    'CONSUMER_VIEW', 'CONSUMER_ADD', 'CONSUMER_EDIT', 'CONSUMER_DELETE',
    'CONSUMER_RESET', 'CONSUMER_SETTLE_BALANCE', 'CONSUMER_EXPORT_CSV',
    'CONSUMER_SEND_STATEMENT',
    // Business Setup
    'MANAGE_BRANCHES', 'MANAGE_PAYMENT_METHODS', 'MANAGE_EMAIL_CONFIG',
    'MANAGE_EMAIL_TEMPLATES',
    // System Administration
    'MANAGE_USERS', 'MANAGE_ROLES', 'MANAGE_API_KEYS',
    // Self-Service
    'SELF_SERVICE_VIEW', 'SELF_SERVICE_MANAGE',
    'SELF_SERVICE_VIEW_TRANSACTIONS',
    // Misc
    'AI_ACCESS',
]);

// --- Users ---

const getUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
        const offset = (page - 1) * limit;

        const countRes = await pool.query('SELECT COUNT(*) FROM users');
        const total = parseInt(countRes.rows[0].count);

        const result = await pool.query(
            'SELECT id, username, role, branch_id, is_active FROM users ORDER BY username LIMIT $1 OFFSET $2',
            [limit, offset]
        );
        const users = result.rows.map(user => ({
            ...user,
            branchId: user.branch_id,
            isActive: user.is_active
        }));

        res.json({
            data: users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error('Get users database error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const createUser = async (req, res) => {
    const { username, password, role, branchId } = req.body;
    try {
        // Enforce Role Hierarchy
        const reqLevel = getRoleLevel(req.user?.role);
        const targetLevel = getRoleLevel(role);

        if (reqLevel > targetLevel) {
            return res.status(403).json({ error: 'Forbidden: Cannot create a user with privileges higher than your own.' });
        }

        // RBAC-H5: Enforce branch isolation — non-admin users cannot create users in other branches
        if (!isAdmin(req.user) && branchId !== req.user?.branchId) {
            return res.status(403).json({ error: 'Cannot create users in other branches' });
        }

        // Check if user exists
        const check = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const insertRes = await pool.query(
            'INSERT INTO users (id, username, password_hash, role, branch_id) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, username, role, branch_id',
            [username, hashedPassword, role, branchId]
        );
        const newUser = { ...insertRes.rows[0], branchId: insertRes.rows[0].branch_id };
        delete newUser.branch_id;
        logAction(req.user?.id, req.user?.username, 'CREATE_USER', `Created user ${username} with role ${role}`, req.user?.branchId);
        emitEvent('data:updated', { type: 'user' });
        res.status(201).json(newUser);
    } catch (err) {
        logger.error('Create user database error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const updateUser = async (req, res) => {
    const { id } = req.params;
    const { role: requestedRole, password, branchId: requestedBranchId, isActive } = req.body;

    try {
        // Fetch target user
        const targetUser = await pool.query('SELECT role, branch_id, username, is_active FROM users WHERE id = $1', [id]);
        if (targetUser.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentRole = targetUser.rows[0].role;
        const currentBranchId = targetUser.rows[0].branch_id;
        const targetUsername = targetUser.rows[0].username;

        // Partial updates (e.g. the disable/enable toggle) don't resend role/branchId —
        // fall back to the user's current values so the hierarchy checks below still apply.
        const role = requestedRole !== undefined ? requestedRole : currentRole;
        const branchId = requestedBranchId !== undefined ? requestedBranchId : currentBranchId;

        // Enforce Role Hierarchy
        const reqLevel = getRoleLevel(req.user?.role);
        const targetCurrentLevel = getRoleLevel(currentRole);
        const requestedNewLevel = getRoleLevel(role);

        if (reqLevel > targetCurrentLevel) {
            return res.status(403).json({ error: 'Forbidden: Cannot modify a user with privileges equal to or higher than your own.' });
        }
        if (reqLevel > requestedNewLevel) {
            return res.status(403).json({ error: 'Forbidden: Cannot elevate a user to privileges higher than your own.' });
        }

        // Enforce Branch Isolation (Assuming non-global admins can only manage their branch)
        const isMainAdmin = req.user?.branchId === null || req.user?.role?.toLowerCase() === ROLES.ADMIN;
        if (!isMainAdmin && req.user?.branchId !== currentBranchId) {
            return res.status(403).json({ error: 'Forbidden: Cannot modify users from a different branch.' });
        }

        // Issue 1: Block non-admins from granting global scope via branchId=null
        if (!isMainAdmin && (branchId === null || branchId === undefined || branchId === '')) {
            return res.status(403).json({ error: 'Forbidden: Cannot set branchId to null.' });
        }
        // Issue 2: Block non-admins from moving users to a different branch
        if (!isMainAdmin && branchId !== undefined && branchId !== currentBranchId) {
            return res.status(403).json({ error: 'Forbidden: Cannot reassign users to a different branch.' });
        }

        const nextActive = isActive !== undefined ? !!isActive : targetUser.rows[0].is_active;
        if (isActive === false) {
            if (req.user?.id === id) {
                return res.status(400).json({ error: 'Cannot disable your own account.' });
            }
            if (currentRole === 'Admin') {
                const adminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'Admin' AND is_active = true");
                if (parseInt(adminCount.rows[0].count) <= 1) {
                    return res.status(400).json({ error: 'Cannot disable the last remaining active Admin user.' });
                }
            }
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 12);
            await pool.query('UPDATE users SET role = $1, password_hash = $2, branch_id = $3, is_active = $4 WHERE id = $5', [role, hashedPassword, branchId, nextActive, id]);
        } else {
            await pool.query('UPDATE users SET role = $1, branch_id = $2, is_active = $3 WHERE id = $4', [role, branchId, nextActive, id]);
        }
        // Invalidate the updated user's existing sessions so changes take effect immediately
        await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
        // Purge the role re-verification cache so any live token picks up the new role/active state within seconds
        invalidateUserRoleCache(id);
        emitToUser(id, 'user:force-logout', { reason: isActive === false ? 'account_disabled' : 'account_updated' });
        logAction(req.user?.id, req.user?.username, 'UPDATE_USER', `Updated user ID ${id} to role ${role}`, req.user?.branchId);
        if (password) {
            logAction(req.user?.id, req.user?.username, 'ADMIN_RESET_PASSWORD', `Admin reset password for user ${targetUsername}`, req.user?.branchId);
        }
        if (isActive !== undefined && nextActive !== targetUser.rows[0].is_active) {
            logAction(req.user?.id, req.user?.username, nextActive ? 'ENABLE_USER' : 'DISABLE_USER', `${nextActive ? 'Enabled' : 'Disabled'} user ${targetUsername}`, req.user?.branchId);
        }
        emitEvent('data:updated', { type: 'user' });
        res.json({ success: true });
    } catch (err) {
        logger.error('Update user database error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        // Fetch target user 
        const targetUser = await pool.query('SELECT role, branch_id FROM users WHERE id = $1', [id]);
        if (targetUser.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentRole = targetUser.rows[0].role;
        const currentBranchId = targetUser.rows[0].branch_id;

        // Enforce Role Hierarchy
        const reqLevel = getRoleLevel(req.user?.role);
        const targetCurrentLevel = getRoleLevel(currentRole);

        if (reqLevel > targetCurrentLevel || (reqLevel === targetCurrentLevel && req.user?.id !== id)) {
            return res.status(403).json({ error: 'Forbidden: Cannot delete a user with privileges equal to or higher than your own.' });
        }

        // Prevent self-deletion if they are the only admin
        if (req.user?.id === id) {
            const adminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'Admin'");
            if (parseInt(adminCount.rows[0].count) <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last remaining Admin user.' });
            }
        }

        // Enforce Branch Isolation
        const isMainAdmin = req.user?.branchId === null || req.user?.role?.toLowerCase() === ROLES.ADMIN;
        if (!isMainAdmin && req.user?.branchId !== currentBranchId) {
            return res.status(403).json({ error: 'Forbidden: Cannot delete users from a different branch.' });
        }

        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        // Invalidate sessions before the user record is gone — emit to their socket room first
        await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
        // Purge the role re-verification cache for the deleted user
        invalidateUserRoleCache(id);
        emitToUser(id, 'user:force-logout', { reason: 'account_deleted' });
        logAction(req.user?.id, req.user?.username, 'DELETE_USER', `Deleted user ID ${id}`, req.user?.branchId);
        emitEvent('data:updated', { type: 'user' });
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete user database error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

// --- Roles ---

const getRoles = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
        const offset = (page - 1) * limit;

        const countRes = await pool.query('SELECT COUNT(*) FROM roles');
        const total = parseInt(countRes.rows[0].count);

        const result = await pool.query('SELECT * FROM roles ORDER BY name LIMIT $1 OFFSET $2', [limit, offset]);

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
        logger.error('Get roles database error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const updateRole = async (req, res) => {
    const { name } = req.params;
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Permissions must be an array' });
    }
    const invalid = permissions.filter(p => !CANONICAL_PERMISSIONS.has(p));
    if (invalid.length > 0) {
        return res.status(400).json({ error: `Unknown permissions: ${invalid.join(', ')}` });
    }
    try {
        // M-12: capture before-state for diff logging
        const before = await pool.query('SELECT permissions FROM roles WHERE name = $1', [name]);
        if (!before.rows.length) return res.status(404).json({ error: 'Role not found' });
        // permissions is JSONB — pg returns it already parsed as an array, not a string
        const raw = before.rows[0].permissions;
        const beforePerms = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');

        await pool.query('UPDATE roles SET permissions = $1 WHERE name = $2', [JSON.stringify(permissions), name]);

        // Force-logout all affected users so their JWT reflects the new permissions immediately.
        // Exclude the current user so the admin doesn't get logged out mid-session.
        const affected = await pool.query('SELECT id FROM users WHERE role = $1 AND id != $2', [name, req.user.id]);
        for (const row of affected.rows) {
            await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [row.id]);
            emitToUser(row.id, 'user:force-logout', { reason: 'role_updated' });
        }

        const added = permissions.filter(p => !beforePerms.includes(p));
        const removed = beforePerms.filter(p => !permissions.includes(p));
        const diffSummary = [
            added.length ? `+[${added.join(',')}]` : '',
            removed.length ? `-[${removed.join(',')}]` : '',
        ].filter(Boolean).join(' ') || 'no change';
        logAction(req.user?.id, req.user?.username, 'UPDATE_ROLE', `Updated permissions for role ${name}: ${diffSummary}`, req.user?.branchId);
        emitEvent('data:updated', { type: 'role' });
        res.json({ success: true });
    } catch (err) {
        logger.error('Update role database error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const createRole = async (req, res) => {
    const { name, permissions = [] } = req.body;

    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Role name is required' });
    }

    if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Permissions must be an array' });
    }
    const invalid = permissions.filter(p => !CANONICAL_PERMISSIONS.has(p));
    if (invalid.length > 0) {
        return res.status(400).json({ error: `Unknown permissions: ${invalid.join(', ')}` });
    }

    const roleName = name.trim().toLowerCase();

    try {
        // Check if role already exists
        const existing = await pool.query('SELECT * FROM roles WHERE LOWER(name) = LOWER($1)', [roleName]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Role already exists' });
        }

        const roleInsertRes = await pool.query(
            'INSERT INTO roles (name, permissions) VALUES ($1, $2) RETURNING *',
            [roleName, JSON.stringify(permissions)]
        );
        const newRole = roleInsertRes.rows[0];

        logAction(req.user?.id, req.user?.username, 'CREATE_ROLE', `Created role ${roleName}`, req.user?.branchId);
        emitEvent('data:updated', { type: 'role' });
        res.status(201).json(newRole);
    } catch (err) {
        logger.error('Create role database error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const deleteRole = async (req, res) => {
    const { name } = req.params;

    // Protect built-in roles
    const protectedRoles = ['Admin', 'Manager', 'Staff'];
    if (protectedRoles.includes(name)) {
        return res.status(400).json({ error: `Cannot delete built-in role: ${name}` });
    }

    try {
        // Check if any users are assigned to this role
        const usersWithRole = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', [name]);
        if (parseInt(usersWithRole.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Cannot delete role: Users are assigned to it' });
        }

        await pool.query('DELETE FROM roles WHERE name = $1', [name]);
        logAction(req.user?.id, req.user?.username, 'DELETE_ROLE', `Deleted role ${name}`, req.user?.branchId);
        emitEvent('data:updated', { type: 'role' });
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete role database error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

module.exports = {
    getUsers,
    createUser,
    updateUser,
    deleteUser,
    getRoles,
    updateRole,
    createRole,
    deleteRole
};
