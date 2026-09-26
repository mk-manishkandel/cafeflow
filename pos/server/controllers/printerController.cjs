const { ROLES } = require('../utils/roleHierarchy.cjs');
const net = require('net');
const { pool } = require('../config/db.cjs');
const logger = require('../utils/logger.cjs');

const VALID_MODES = ['LOCAL', 'OFF'];
const VALID_TYPES = ['THERMAL_80MM', 'THERMAL_58MM', 'LASER', 'A4'];
// Matches document_templates.type CHECK constraint — kept in sync automatically
// via the /api/printers/available-services endpoint which queries the DB.
const VALID_SERVICES = ['KOT', 'BILL', 'RECEIPT', 'INVOICE', 'PAYOUT', 'CUSTOM_ORDER'];

// Returns true if branchId belongs to the Main Branch.
// Used throughout to decide whether to skip the branch_id ownership check.
const checkIsMainBranch = async (branchId) => {
    if (!branchId) return false;
    const r = await pool.query(
        "SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1"
    );
    return r.rows[0]?.id === branchId;
};

// ---------------------------------------------------------------------------
// Shared utility — used by tableController, printController, etc.
// Returns { id, name, mode, ip_address, port, printer_type } or null
// ---------------------------------------------------------------------------
const getPrinterForService = async (branchId, serviceType) => {
    if (!serviceType) return null;
    try {
        const res = await pool.query(
            `SELECT p.id, p.name, p.mode,
                    p.ip_address, p.port, p.printer_type
             FROM printers p
             JOIN printer_assignments pa ON pa.printer_id = p.id
             WHERE pa.service_type = $1
               AND p.is_active = true
               AND (p.branch_id = $2 OR p.branch_id IS NULL)
             ORDER BY
               CASE WHEN p.branch_id = $2 THEN 0 ELSE 1 END,
               p.sort_order ASC,
               p.created_at ASC
             LIMIT 1`,
            [serviceType, branchId || null]
        );
        return res.rows[0] || null;
    } catch (err) {
        logger.error('getPrinterForService error', err);
        return null;
    }
};

// ---------------------------------------------------------------------------
// Internal helper — upsert service assignments inside an existing transaction
// ---------------------------------------------------------------------------
const _assignServicesInTransaction = async (client, printerId, serviceTypes) => {
    await client.query('DELETE FROM printer_assignments WHERE printer_id = $1', [printerId]);
    if (serviceTypes.length > 0) {
        const values = serviceTypes.map((_, i) => `($1, $${i + 2})`).join(', ');
        await client.query(
            `INSERT INTO printer_assignments (printer_id, service_type) VALUES ${values}`,
            [printerId, ...serviceTypes]
        );
    }
};

// ---------------------------------------------------------------------------
// Shared validation — returns an error string or null
// ---------------------------------------------------------------------------
const validateFields = ({ name, description, printer_type, mode, ip_address, port, sort_order, service_types, requireName = false }) => {
    if (requireName || name !== undefined) {
        if (!name?.trim()) return 'Printer name is required';
        if (name.trim().length > 100) return 'Printer name must be 100 characters or fewer';
    }
    if (description !== undefined && description && description.length > 500) return 'Description must be 500 characters or fewer';
    if (mode !== undefined && !VALID_MODES.includes(mode)) return `mode must be one of: ${VALID_MODES.join(', ')}`;
    if (printer_type !== undefined && !VALID_TYPES.includes(printer_type)) return `printer_type must be one of: ${VALID_TYPES.join(', ')}`;
    if (ip_address !== undefined && ip_address && ip_address.length > 100) return 'IP address must be 100 characters or fewer';
    if (port !== undefined && port !== null) {
        const p = Number(port);
        if (!Number.isInteger(p) || p < 1 || p > 65535) return 'port must be an integer between 1 and 65535';
    }
    if (sort_order !== undefined && sort_order !== null) {
        const n = Number(sort_order);
        if (!Number.isInteger(n) || n < 0 || n > 9999) return 'sort_order must be an integer between 0 and 9999';
    }
    if (service_types !== undefined) {
        if (!Array.isArray(service_types)) return 'service_types must be an array';
        const invalid = service_types.filter(s => !VALID_SERVICES.includes(s));
        if (invalid.length) return `Invalid service types: ${invalid.join(', ')}`;
    }
    return null;
};

// ---------------------------------------------------------------------------
// GET /api/printers — list all printers for branch with their assignments
// ---------------------------------------------------------------------------
const listPrinters = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        let isMainBranch = false;
        if (isAdmin) {
            const mainRes = await pool.query(
                "SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1"
            );
            isMainBranch = mainRes.rows[0]?.id === branchId;
        }
        const showAll = isMainBranch;

        const result = await pool.query(
            `SELECT p.*,
                b.name AS branch_name,
                COALESCE(
                    json_agg(pa.service_type ORDER BY pa.service_type) FILTER (WHERE pa.service_type IS NOT NULL),
                    '[]'
                ) AS service_types
             FROM printers p
             LEFT JOIN branches b ON b.id = p.branch_id
             LEFT JOIN printer_assignments pa ON pa.printer_id = p.id
             ${showAll ? '' : 'WHERE p.branch_id = $1'}
             GROUP BY p.id, b.name
             ORDER BY p.sort_order ASC, p.created_at ASC`,
            showAll ? [] : [branchId]
        );

        // For Main Branch admins, also return the branch list for the target-branch dropdown
        let branches = [];
        if (isMainBranch) {
            const branchRes = await pool.query(
                'SELECT id, name FROM branches WHERE is_active = true ORDER BY name ASC'
            );
            branches = branchRes.rows;
        }

        res.json({ printers: result.rows, isMainBranch, branches });
    } catch (err) {
        logger.error('listPrinters error', err);
        res.status(500).json({ error: 'Failed to fetch printers' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/printers — create a printer + assign services atomically
// Body: { name, description?, printer_type?, mode?, sort_order?, service_types?, target_branch_id? }
// ---------------------------------------------------------------------------
const createPrinter = async (req, res) => {
    const client = await pool.connect();
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

        const { name, description, printer_type = 'THERMAL_80MM', mode = 'OFF', ip_address, port = 9100, sort_order = 0, service_types = [], target_branch_id } = req.body;

        const validationError = validateFields({ name, description, printer_type, mode, ip_address, port, sort_order, service_types, requireName: true });
        if (validationError) return res.status(400).json({ error: validationError });

        // Determine effective branch: Main Branch admins may assign to any branch
        let effectiveBranchId = branchId;
        const mainRes = await pool.query(
            "SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1"
        );
        const isMainBranch = mainRes.rows[0]?.id === branchId;

        if (isMainBranch && target_branch_id) {
            const targetRes = await pool.query(
                'SELECT id FROM branches WHERE id = $1 AND is_active = true',
                [target_branch_id]
            );
            if (!targetRes.rows.length) return res.status(400).json({ error: 'Target branch not found' });
            effectiveBranchId = target_branch_id;
        }

        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO printers (branch_id, name, description, printer_type, mode, ip_address, port, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                effectiveBranchId,
                name.trim(),
                description?.trim() || null,
                printer_type,
                mode,
                ip_address?.trim() || null,
                port ? Number(port) : 9100,
                Number(sort_order),
            ]
        );
        const printer = result.rows[0];

        await _assignServicesInTransaction(client, printer.id, service_types);
        await client.query('COMMIT');

        res.status(201).json({ ...printer, service_types });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A printer with this name already exists in this branch' });
        }
        logger.error('createPrinter error', err);
        res.status(500).json({ error: 'Failed to create printer' });
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// PUT /api/printers/:id — update a printer + reassign services atomically
// Body: { name, description, printer_type, mode, is_active, sort_order, service_types, target_branch_id? }
// All fields are replaced with provided values; send null to clear optional fields.
// ---------------------------------------------------------------------------
const updatePrinter = async (req, res) => {
    const client = await pool.connect();
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { id } = req.params;
        const { name, description, printer_type, mode, ip_address, port, is_active, sort_order, service_types, target_branch_id } = req.body;

        const validationError = validateFields({ name, description, printer_type, mode, ip_address, port, sort_order, service_types, requireName: true });
        if (validationError) return res.status(400).json({ error: validationError });

        // Determine if caller is a Main Branch admin (can reassign printer's branch)
        const mainRes = await pool.query(
            "SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1"
        );
        const isMainBranch = mainRes.rows[0]?.id === branchId;

        // Resolve the new branch for the printer (may differ from caller's branch)
        let newBranchId = null;
        if (isMainBranch && target_branch_id) {
            const targetRes = await pool.query(
                'SELECT id FROM branches WHERE id = $1 AND is_active = true',
                [target_branch_id]
            );
            if (!targetRes.rows.length) return res.status(400).json({ error: 'Target branch not found' });
            newBranchId = target_branch_id;
        }

        // Duplicate name check — check against the effective branch
        if (name !== undefined) {
            const checkBranchId = newBranchId || branchId;
            const dup = await pool.query(
                'SELECT id FROM printers WHERE branch_id = $1 AND LOWER(TRIM(name)) = LOWER($2) AND id <> $3',
                [checkBranchId, name.trim(), id]
            );
            if (dup.rows.length) return res.status(409).json({ error: 'A printer with this name already exists in this branch' });
        }

        await client.query('BEGIN');

        // Build parameterized query depending on context:
        // - Main Branch admins can update any printer (no branch_id filter in WHERE).
        // - When reassigning branch, include branch_id in the SET clause as a safe parameter.
        let sql;
        let queryParams;

        if (isMainBranch && newBranchId) {
            sql = `UPDATE printers
                   SET name         = $1,
                       description  = $2,
                       printer_type = $3,
                       mode         = $4,
                       ip_address   = $5,
                       port         = $6,
                       is_active    = $7,
                       sort_order   = $8,
                       branch_id    = $9,
                       updated_at   = CURRENT_TIMESTAMP
                   WHERE id = $10
                   RETURNING *`;
            queryParams = [
                name?.trim() ?? null,
                description?.trim() || null,
                printer_type ?? null,
                mode ?? null,
                ip_address?.trim() || null,
                port != null ? Number(port) : 9100,
                is_active ?? true,
                sort_order != null ? Number(sort_order) : 0,
                newBranchId,
                id,
            ];
        } else if (isMainBranch) {
            // Main Branch admin, no branch reassignment — can still edit any printer
            sql = `UPDATE printers
                   SET name         = $1,
                       description  = $2,
                       printer_type = $3,
                       mode         = $4,
                       ip_address   = $5,
                       port         = $6,
                       is_active    = $7,
                       sort_order   = $8,
                       updated_at   = CURRENT_TIMESTAMP
                   WHERE id = $9
                   RETURNING *`;
            queryParams = [
                name?.trim() ?? null,
                description?.trim() || null,
                printer_type ?? null,
                mode ?? null,
                ip_address?.trim() || null,
                port != null ? Number(port) : 9100,
                is_active ?? true,
                sort_order != null ? Number(sort_order) : 0,
                id,
            ];
        } else {
            // Regular branch user — restricted to own branch
            sql = `UPDATE printers
                   SET name         = $1,
                       description  = $2,
                       printer_type = $3,
                       mode         = $4,
                       ip_address   = $5,
                       port         = $6,
                       is_active    = $7,
                       sort_order   = $8,
                       updated_at   = CURRENT_TIMESTAMP
                   WHERE id = $9 AND branch_id = $10
                   RETURNING *`;
            queryParams = [
                name?.trim() ?? null,
                description?.trim() || null,
                printer_type ?? null,
                mode ?? null,
                ip_address?.trim() || null,
                port != null ? Number(port) : 9100,
                is_active ?? true,
                sort_order != null ? Number(sort_order) : 0,
                id,
                branchId,
            ];
        }

        const result = await client.query(sql, queryParams);

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Printer not found' });
        }

        let finalServiceTypes;
        if (service_types !== undefined) {
            await _assignServicesInTransaction(client, id, service_types);
            finalServiceTypes = service_types;
        } else {
            const svcRes = await client.query(
                'SELECT service_type FROM printer_assignments WHERE printer_id = $1 ORDER BY service_type',
                [id]
            );
            finalServiceTypes = svcRes.rows.map(r => r.service_type);
        }

        await client.query('COMMIT');
        res.json({ ...result.rows[0], service_types: finalServiceTypes });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('updatePrinter error', err);
        res.status(500).json({ error: 'Failed to update printer' });
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// DELETE /api/printers/:id — delete a printer (cascades to assignments)
// ---------------------------------------------------------------------------
const deletePrinter = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { id } = req.params;

        const mainBranch = await checkIsMainBranch(branchId);
        const result = await pool.query(
            mainBranch
                ? 'DELETE FROM printers WHERE id = $1 RETURNING id'
                : 'DELETE FROM printers WHERE id = $1 AND branch_id = $2 RETURNING id',
            mainBranch ? [id] : [id, branchId]
        );

        if (!result.rows.length) return res.status(404).json({ error: 'Printer not found' });
        res.json({ success: true });
    } catch (err) {
        logger.error('deletePrinter error', err);
        res.status(500).json({ error: 'Failed to delete printer' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/printers/:id/assign — replace service assignments for a printer
// Body: { service_types: ['KOT', 'BILL'] }
// ---------------------------------------------------------------------------
const assignServices = async (req, res) => {
    const client = await pool.connect();
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { id } = req.params;
        const { service_types } = req.body;

        if (!Array.isArray(service_types)) return res.status(400).json({ error: 'service_types must be an array' });
        const invalid = service_types.filter(s => !VALID_SERVICES.includes(s));
        if (invalid.length) return res.status(400).json({ error: `Invalid service types: ${invalid.join(', ')}` });

        const mainBranch = await checkIsMainBranch(branchId);
        const check = await pool.query(
            mainBranch
                ? 'SELECT id FROM printers WHERE id = $1'
                : 'SELECT id FROM printers WHERE id = $1 AND branch_id = $2',
            mainBranch ? [id] : [id, branchId]
        );
        if (!check.rows.length) return res.status(404).json({ error: 'Printer not found' });

        await client.query('BEGIN');
        await _assignServicesInTransaction(client, id, service_types);
        await client.query('COMMIT');

        res.json({ success: true, service_types });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('assignServices error', err);
        res.status(500).json({ error: 'Failed to assign services' });
    } finally {
        client.release();
    }
};

// ---------------------------------------------------------------------------
// GET /api/printers/available-services — return service types that have at least
// one active document template (global or for this branch), so the UI only shows
// services that can actually produce a printed document.
// ---------------------------------------------------------------------------
const getAvailableServices = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;

        // Fetch distinct template types that are active and visible to this branch
        const result = await pool.query(
            `SELECT DISTINCT type
             FROM document_templates
             WHERE is_active = true
               AND (branch_id IS NULL OR branch_id = $1)
             ORDER BY type`,
            [branchId || null]
        );

        const activeTypes = result.rows.map(r => r.type);

        // Only return types that are also valid printer service names
        const services = VALID_SERVICES
            .filter(s => activeTypes.includes(s))
            .map(s => ({ value: s }));

        res.json(services);
    } catch (err) {
        logger.error('getAvailableServices error', err);
        res.status(500).json({ error: 'Failed to fetch available services' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/printers/for-service/:serviceType — resolve active printer for a service
// ---------------------------------------------------------------------------
const getForService = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { serviceType } = req.params;

        if (!VALID_SERVICES.includes(serviceType)) {
            return res.status(400).json({ error: `serviceType must be one of: ${VALID_SERVICES.join(', ')}` });
        }

        const printer = await getPrinterForService(branchId, serviceType);
        res.json(printer || null);
    } catch (err) {
        logger.error('getForService error', err);
        res.status(500).json({ error: 'Failed to resolve printer' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/printers/status — health overview for all branch printers
// ---------------------------------------------------------------------------
const getStatus = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        let showAll = false;
        if (isAdmin) {
            const mainRes = await pool.query(
                "SELECT id FROM branches WHERE name = 'Main Branch' AND is_active = true LIMIT 1"
            );
            showAll = mainRes.rows[0]?.id === branchId;
        }

        const result = await pool.query(
            `SELECT
                p.id, p.name, p.mode, p.is_active, p.ip_address, p.port,
                COALESCE(jobs.pending, 0)  AS pending_jobs,
                COALESCE(jobs.failed, 0)   AS failed_jobs
             FROM printers p
             LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
                    COUNT(*) FILTER (WHERE status = 'FAILED')  AS failed
                FROM print_jobs j
                WHERE j.printer_id = p.id
                  AND j.created_at >= NOW() - INTERVAL '24 HOURS'
             ) jobs ON true
             ${showAll ? '' : 'WHERE p.branch_id = $1'}
             ORDER BY p.sort_order ASC, p.created_at ASC`,
            showAll ? [] : [branchId]
        );

        res.json(result.rows);
    } catch (err) {
        logger.error('getStatus error', err);
        res.status(500).json({ error: 'Failed to fetch printer status' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/printers/:id/retry — requeue all FAILED jobs for a printer
// ---------------------------------------------------------------------------
const retryFailed = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { id } = req.params;

        const mainBranch = await checkIsMainBranch(branchId);
        const check = await pool.query(
            mainBranch
                ? 'SELECT id FROM printers WHERE id = $1'
                : 'SELECT id FROM printers WHERE id = $1 AND branch_id = $2',
            mainBranch ? [id] : [id, branchId]
        );
        if (!check.rows.length) return res.status(404).json({ error: 'Printer not found' });

        const result = await pool.query(
            `UPDATE print_jobs
             SET status = 'PENDING', error_message = NULL, retry_count = 0, updated_at = NOW()
             WHERE printer_id = $1 AND status = 'FAILED'
               AND created_at >= NOW() - INTERVAL '24 HOURS'
             RETURNING id`,
            [id]
        );

        res.json({ requeued: result.rowCount });
    } catch (err) {
        logger.error('retryFailed error', err);
        res.status(500).json({ error: 'Failed to retry jobs' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/printers/:id/test — try a TCP connection to the printer's ip:port
// Returns { online: true/false, latency_ms, ip_address, port }
// ---------------------------------------------------------------------------
const testConnection = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { id } = req.params;

        const mainBranch = await checkIsMainBranch(branchId);
        const result = await pool.query(
            mainBranch
                ? 'SELECT ip_address, port FROM printers WHERE id = $1'
                : 'SELECT ip_address, port FROM printers WHERE id = $1 AND branch_id = $2',
            mainBranch ? [id] : [id, branchId]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Printer not found' });

        const { ip_address, port = 9100 } = result.rows[0];
        if (!ip_address) return res.status(400).json({ error: 'No IP address configured for this printer' });

        const start = Date.now();
        const online = await new Promise(resolve => {
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve(false);
            }, 3000);
            socket.connect(port, ip_address, () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve(true);
            });
            socket.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
        });

        const latency = Date.now() - start;
        res.json({ online, latency_ms: online ? latency : null, ip_address, port });
    } catch (err) {
        logger.error('testConnection error', err);
        res.status(500).json({ error: 'Connection test failed' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/printers/:id/jobs — pending + failed jobs for a printer (last 24h)
// ---------------------------------------------------------------------------
const getJobs = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { id } = req.params;
        const { status } = req.query; // optional filter: PENDING | FAILED | PRINTED

        const mainBranch = await checkIsMainBranch(branchId);
        const check = await pool.query(
            mainBranch
                ? 'SELECT id FROM printers WHERE id = $1'
                : 'SELECT id FROM printers WHERE id = $1 AND branch_id = $2',
            mainBranch ? [id] : [id, branchId]
        );
        if (!check.rows.length) return res.status(404).json({ error: 'Printer not found' });

        const params = [id];
        const statusClause = status
            ? `AND j.status = $${params.push(status)}`
            : "AND j.status IN ('PENDING', 'FAILED')";

        const result = await pool.query(
            `SELECT j.id, j.status, j.service_type, j.error_message,
                    j.retry_count, j.created_at, j.updated_at
             FROM print_jobs j
             WHERE j.printer_id = $1
               ${statusClause}
               AND j.created_at >= NOW() - INTERVAL '24 HOURS'
             ORDER BY j.created_at DESC
             LIMIT 100`,
            params
        );

        res.json(result.rows);
    } catch (err) {
        logger.error('getJobs error', err);
        res.status(500).json({ error: 'Failed to fetch print jobs' });
    }
};

// ---------------------------------------------------------------------------
// DELETE /api/printers/:id/jobs/:jobId — delete a single print job
// ---------------------------------------------------------------------------
const deleteJob = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { id, jobId } = req.params;

        const result = await pool.query(
            `DELETE FROM print_jobs
             WHERE id = $1 AND printer_id = $2 AND branch_id = $3
             RETURNING id`,
            [jobId, id, branchId]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
        res.json({ success: true });
    } catch (err) {
        logger.error('deleteJob error', err);
        res.status(500).json({ error: 'Failed to delete print job' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/printers/:id/cancel-pending — cancel all PENDING jobs for a printer
// ---------------------------------------------------------------------------
const cancelPending = async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.user.branchId;
        const { id } = req.params;

        const check = await pool.query(
            'SELECT id FROM printers WHERE id = $1 AND branch_id = $2',
            [id, branchId]
        );
        if (!check.rows.length) return res.status(404).json({ error: 'Printer not found' });

        const result = await pool.query(
            `UPDATE print_jobs
             SET status = 'FAILED', error_message = 'Cancelled by user', updated_at = NOW()
             WHERE printer_id = $1 AND status = 'PENDING'
             RETURNING id`,
            [id]
        );

        res.json({ cancelled: result.rowCount });
    } catch (err) {
        logger.error('cancelPending error', err);
        res.status(500).json({ error: 'Failed to cancel pending jobs' });
    }
};

module.exports = {
    listPrinters,
    createPrinter,
    updatePrinter,
    deletePrinter,
    assignServices,
    getAvailableServices,
    getForService,
    getStatus,
    retryFailed,
    cancelPending,
    getJobs,
    deleteJob,
    getPrinterForService,
    testConnection,
};
