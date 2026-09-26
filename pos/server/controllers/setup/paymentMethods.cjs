const { pool } = require('../../config/db.cjs');
const { logAction } = require('../../utils/actions.cjs');
const logger = require('../../utils/logger.cjs');

const QR_TYPES = ['none', 'static'];

// Helper: returns true if the requesting user belongs to 'Main Branch' or is global admin
const _isMainBranchAdmin = async (userBranchId) => {
    if (!userBranchId) return true;
    const res = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [userBranchId]);
    return res.rows[0]?.name === 'Main Branch';
};

const getPaymentMethods = async (req, res) => {
    try {
        const userBranchId = req.user?.branchId;
        const { branchId: queryBranchId } = req.query;

        // Use query branchId if provided, fallback to user branchId
        const effectiveBranchId = queryBranchId || userBranchId;

        const isUserMainBranch = await _isMainBranchAdmin(userBranchId);

        let query = `
            SELECT pm.*, b.name as branch_name 
            FROM payment_methods pm
            LEFT JOIN branches b ON pm.branch_id = b.id AND b.is_active = true
            WHERE pm.is_active = true
        `;
        const params = [];

        // === Filtering logic ===
        // Case 1: Main Branch admin, no specific queryBranchId → return ALL methods (global overview)
        // Case 2: Public request OR Main Branch admin + specific queryBranchId, OR non-main-branch admin
        //   → show GLOBAL methods (branch_id IS NULL) + that branch's own methods
        if ((isUserMainBranch && !queryBranchId) || (!userBranchId && !queryBranchId)) {
            // No filter — show everything (Admin or generic public fetch without branch context)
        } else if (effectiveBranchId) {
            query += ' AND (pm.branch_id IS NULL OR pm.branch_id = $1)';
            params.push(effectiveBranchId);
        }

        query += ' ORDER BY pm.is_default DESC, pm.name ASC';
        const result = await pool.query(query, params);

        res.json(result.rows.map(row => ({
            id: row.id,
            name: row.name,
            type: row.type,
            isDefault: row.is_default,
            isActive: row.is_active,
            qrType: row.qr_type,
            qrData: row.qr_data,
            showQrInPos: row.show_qr_in_pos,
            isGlobal: row.branch_id === null,
            branchName: row.branch_name === 'Main Branch' ? 'System' : row.branch_name,
            config: row.config
        })));
    } catch (error) {
        logger.error('Error reading payment methods', error);
        res.status(500).json({ error: 'Failed to load payment methods' });
    }
};

const addPaymentMethod = async (req, res) => {
    try {
        const { name, type, qrType = 'none', qrData = null, showQrInPos = false, config = {} } = req.body;
        const { branchId: userBranchId } = req.user;
        const { branchId: queryBranchId } = req.query;

        if (!name || !type) {
            return res.status(400).json({ error: 'Name and Type are required' });
        }
        if (!QR_TYPES.includes(qrType)) {
            return res.status(400).json({ error: "qrType must be 'none' or 'static'" });
        }

        const isUserMainBranch = await _isMainBranchAdmin(userBranchId);
        const targetBranchId = (isUserMainBranch && queryBranchId) ? queryBranchId : userBranchId;

        // Validation: Every payment method MUST belong to a specific operational branch.
        // We prevent creating "Global" methods and methods for the "Main Branch" container.
        if (!targetBranchId) {
            return res.status(400).json({ error: 'Please select a specific target branch. Global payment methods are not allowed.' });
        }

        const branchCheck = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [targetBranchId]);
        if (branchCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Selected branch does not exist.' });
        }
        if (branchCheck.rows[0].name === 'Main Branch') {
            return res.status(400).json({ error: 'Payment methods cannot be created for the Main Branch. Please select an operational branch like Cafe or Canteen.' });
        }

        const id = require('crypto').randomUUID();

        await pool.query(
            'INSERT INTO payment_methods (id, name, type, qr_type, qr_data, show_qr_in_pos, is_default, is_active, branch_id, config) VALUES ($1, $2, $3, $4, $5, $6, false, true, $7, $8)',
            [id, name, type, qrType, qrData, showQrInPos, targetBranchId, JSON.stringify(config)]
        );

        logger.info(`Payment method added: ${name} (Branch: ${targetBranchId}) by ${req.user.username}`);
        logAction(req.user?.id, req.user?.username, 'ADD_PAYMENT_METHOD', `Payment method added: ${name}`, req.user?.branchId);
        res.status(201).json({ id, name, type, qrType, qrData, showQrInPos, isDefault: false, isGlobal: targetBranchId === null, branchId: targetBranchId });
    } catch (error) {
        logger.error(`Error adding payment method: code=${error.code} msg=${error.message}`, error);
        if (error.code === '23505') {
            return res.status(400).json({ error: 'A payment method with this name already exists in the target branch.' });
        }
        res.status(500).json({ error: 'Failed to add payment method' });
    }
};

const deletePaymentMethod = async (req, res) => {
    try {
        const { id } = req.params;
        const { branchId } = req.user;

        const result = await pool.query('SELECT is_default, branch_id FROM payment_methods WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment method not found' });
        }

        // Prevent deleting the system-level default cash method
        if (result.rows[0].is_default) {
            return res.status(400).json({ error: 'Cannot delete the system default payment method' });
        }

        const isMainAdmin = await _isMainBranchAdmin(branchId);

        // Main-branch admins can delete any method;
        // branch admins can only delete methods belonging to their own branch
        if (!isMainAdmin && result.rows[0].branch_id !== branchId) {
            return res.status(403).json({ error: 'Unauthorized: You can only delete your own branch payment methods' });
        }

        await pool.query('UPDATE payment_methods SET is_active = false WHERE id = $1', [id]);

        logger.info(`Payment method deleted: ${id} by ${req.user.username}`);
        res.json({ message: 'Payment method deleted successfully' });
    } catch (error) {
        logger.error('Error deleting payment method', error);
        res.status(500).json({ error: 'Failed to delete payment method' });
    }
};

const updatePaymentMethod = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, qrType = 'none', qrData = null, showQrInPos = false, config } = req.body;
        const { branchId } = req.user;

        if (!QR_TYPES.includes(qrType)) {
            return res.status(400).json({ error: "qrType must be 'none' or 'static'" });
        }

        const result = await pool.query('SELECT is_default, branch_id FROM payment_methods WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment method not found' });
        }

        const isDefault = result.rows[0].is_default;

        const isMainAdmin = await _isMainBranchAdmin(branchId);

        // Main-branch admins can update any method;
        // branch admins can only update methods belonging to their own branch
        if (!isMainAdmin && result.rows[0].branch_id !== branchId) {
            return res.status(403).json({ error: 'Unauthorized: You can only modify your own branch payment methods' });
        }

        const targetName = isDefault ? 'Cash' : name;
        const targetType = isDefault ? 'cash' : type;

        await pool.query(
            'UPDATE payment_methods SET name = $1, type = $2, qr_type = $3, qr_data = $4, show_qr_in_pos = $5, config = $6 WHERE id = $7',
            [targetName, targetType, qrType, qrData, showQrInPos, config ? JSON.stringify(config) : '{}', id]
        );

        logger.info(`Payment method updated: ${id} by ${req.user.username}`);
        logAction(req.user?.id, req.user?.username, 'UPDATE_PAYMENT_METHOD', `Payment method updated: ${targetName}`, req.user?.branchId);
        res.json({ id, name, type, qrType, qrData });
    } catch (error) {
        logger.error('Error updating payment method', error);
        res.status(500).json({ error: 'Failed to update payment method' });
    }
};
module.exports = { getPaymentMethods, addPaymentMethod, deletePaymentMethod, updatePaymentMethod };
