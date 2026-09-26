const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool } = require('../config/db.cjs');
const crypto = require('crypto');
const logger = require('../utils/logger.cjs');

// Must stay in sync with SCOPE_PATH_MAP in middleware/auth.cjs
const VALID_SCOPES = ['pos', 'print', 'staff', 'menu', 'consumer', 'admin', 'reports', 'full'];

// Generate a secure random key
const generateRandomKey = () => {
    return 'pk_live_' + crypto.randomBytes(32).toString('hex');
};

// Hash the key for storage
const hashKey = (key) => {
    return crypto.createHash('sha256').update(key).digest('hex');
};

exports.generateKey = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id: user_id, branchId: userBranchId, role } = req.user;
        const { name, branch_id, scope } = req.body;
        const isAdmin = role?.toLowerCase() === ROLES.ADMIN;

        if (!name) {
            return res.status(400).json({ error: 'Key name is required' });
        }

        // Validate scope (comma-separated list of known scopes), if provided
        let finalScope = null;
        if (scope) {
            const scopes = String(scope).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            const invalid = scopes.filter(s => !VALID_SCOPES.includes(s));
            if (invalid.length > 0) {
                return res.status(400).json({ error: `Invalid scope(s): ${invalid.join(', ')}` });
            }
            finalScope = scopes.join(',');
        }

        // Branch restriction for non-admins
        // Only admins may hold a null (global) branchId; non-admins must have an explicit branch.
        const finalBranchId = isAdmin ? branch_id : userBranchId;
        if (!isAdmin && (userBranchId == null)) {
            return res.status(403).json({ error: 'Access Denied: No branch assigned' });
        }

        const apiKey = generateRandomKey();
        const keyHash = hashKey(apiKey);
        const prefix = apiKey.substring(0, 16); // Store longer prefix for identification (pk_live_ + 8 chars)

        const result = await client.query(
            `INSERT INTO api_keys (name, prefix, key_hash, branch_id, created_by, scope)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, prefix, branch_id, scope, created_at`,
            [name, prefix, keyHash, finalBranchId || null, user_id, finalScope]
        );

        // Return the FULL key only once here
        res.status(201).json({
            ...result.rows[0],
            key: apiKey // This is the only time the full key is returned
        });

        logger.info(`New API Key generated: ${name} by user ${user_id}`);

    } catch (err) {
        logger.error('Error generating API key', err);
        res.status(500).json({ error: 'Failed to generate API key' });
    } finally {
        client.release();
    }
};

exports.listKeys = async (req, res) => {
    try {
        const { branchId, role } = req.user;
        const isAdmin = role?.toLowerCase() === ROLES.ADMIN;

        let query = `
            SELECT k.id, k.name, k.prefix, k.branch_id, k.scope, k.created_at, k.last_used_at, u.username as created_by_name
            FROM api_keys k
            LEFT JOIN users u ON k.created_by = u.id
            WHERE k.revoked_at IS NULL
        `;
        const params = [];

        // ENFORCE BRANCH ISOLATION:
        // 1. Non-admins must have an explicit branchId — null/undefined means no branch assigned → 403
        // 2. Admins can see everything OR filter by branch_id query param
        if (!isAdmin) {
            if (branchId == null) return res.status(403).json({ error: 'Access Denied: No branch assigned' });
            if (branchId) {
                params.push(branchId);
                query += ` AND k.branch_id = $${params.length}`;
            }
        } else {
            const { branch_id: filterBranch } = req.query;
            if (filterBranch) {
                params.push(filterBranch);
                query += ` AND k.branch_id = $${params.length}`;
            }
        }

        query += ` ORDER BY created_at DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (err) {
        logger.error('Error listing API keys', err);
        res.status(500).json({ error: 'Failed to list API keys' });
    }
};

exports.revokeKey = async (req, res) => {
    try {
        const { id } = req.params;
        const { branchId, role } = req.user;
        const isAdmin = role?.toLowerCase() === ROLES.ADMIN;

        let query = 'UPDATE api_keys SET revoked_at = NOW() WHERE id = $1';
        const params = [id];

        if (!isAdmin && branchId) {
            params.push(branchId);
            query += ' AND branch_id = $2';
        }

        const result = await pool.query(query + ' RETURNING id', params);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Key not found' });
        }

        res.json({ message: 'API Key revoked successfully' });
        logger.info(`API Key revoked: ${id} by user ${req.user.id}`);

    } catch (err) {
        logger.error('Error revoking API key', err);
        res.status(500).json({ error: 'Failed to revoke API key' });
    }
};
