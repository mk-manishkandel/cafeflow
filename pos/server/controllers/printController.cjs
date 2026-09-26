const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool } = require('../config/db.cjs');
const logger = require('../utils/logger.cjs');
const { emitEvent } = require('../socket.cjs');
const { getPrinterForService } = require('./printerController.cjs');
const { renderDocumentTemplate } = require('../utils/documentTemplateRenderer.cjs');
const { printViaNetwork } = require('../utils/networkPrinterUtils.cjs');

// ---------------------------------------------------------------------------
// POST /api/print/queue — enqueue a print job
// Body: { content, branchId?, target?, printer_id?, idempotency_key?, service_type? }
// If service_type is set and a network printer is configured for that service,
// prints directly via TCP and marks the job PRINTED instead of leaving it PENDING.
// ---------------------------------------------------------------------------
const ALLOWED_SERVICE_TYPES = new Set([
    'KOT', 'RECEIPT', 'INVOICE', 'REPORT', 'LABEL',
    'SELF_SERVICE_RECEIPT'
]);

const queuePrintJob = async (req, res) => {
    const { content, branchId, target, printer_id, idempotency_key, service_type } = req.body;
    try {
        if (service_type && !ALLOWED_SERVICE_TYPES.has(service_type)) {
            return res.status(400).json({ error: `Invalid service_type. Allowed: ${[...ALLOWED_SERVICE_TYPES].join(', ')}` });
        }
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const userBranchId = req.user.branch_id || req.user.branchId;
        const targetBranch = isAdmin ? (branchId || userBranchId) : userBranchId;
        if (!targetBranch) return res.status(400).json({ error: 'Branch ID required' });

        // Idempotency key: printable ASCII, max 128 chars
        if (idempotency_key && (typeof idempotency_key !== 'string' || idempotency_key.length > 128 || !/^[\x21-\x7E]+$/.test(idempotency_key))) {
            return res.status(400).json({ error: 'idempotency_key must be a non-empty printable ASCII string (max 128 chars)' });
        }

        if (idempotency_key) {
            const existing = await pool.query(
                'SELECT id, status FROM print_jobs WHERE idempotency_key = $1',
                [idempotency_key]
            );
            if (existing.rows.length) {
                return res.json({ success: true, jobId: existing.rows[0].id, duplicate: true });
            }
        }

        // If service_type provided, check for a configured network printer and print directly
        if (service_type) {
            const networkPrinter = await getPrinterForService(targetBranch, service_type);
            if (networkPrinter?.ip_address) {
                const jobRes = await pool.query(
                    `INSERT INTO print_jobs
                        (branch_id, content, target, status, printer_id, queued_by, idempotency_key, service_type)
                     VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7)
                     RETURNING id`,
                    [targetBranch, content, target || 'COUNTER', networkPrinter.id,
                     req.user?.id || null, idempotency_key || null, service_type]
                );
                const jobId = jobRes.rows[0].id;

                // Build flat data for ESC/POS hardcoded format — content.transaction holds the raw tx
                const rawTx = (content && typeof content === 'object' && content.transaction)
                    ? content.transaction
                    : (typeof content === 'object' ? content : {});
                const printData = prepareTransactionData(rawTx, content?.branchName || '');

                // Print via TCP with hardcoded ESC/POS format (templateHtml=null) — non-fatal if it fails
                try {
                    await printViaNetwork(networkPrinter, printData, service_type, null);
                    await pool.query(
                        "UPDATE print_jobs SET status = 'PRINTED', updated_at = NOW() WHERE id = $1", [jobId]
                    );
                } catch (printErr) {
                    await pool.query(
                        "UPDATE print_jobs SET status = 'FAILED', error_message = $1, updated_at = NOW() WHERE id = $2",
                        [printErr.message, jobId]
                    );
                    logger.warn(`queuePrintJob TCP [${service_type}] failed: ${printErr.message}`);
                }

                return res.json({ success: true, jobId, printed: true });
            }
        }

        // Validate printer_id belongs to this branch (prevents IDOR)
        let resolvedPrinterId = null;
        if (printer_id) {
            const printerCheck = await pool.query(
                'SELECT id FROM printers WHERE id = $1 AND branch_id = $2 AND is_active = true',
                [printer_id, targetBranch]
            );
            if (!printerCheck.rows.length) {
                return res.status(403).json({ error: 'Printer not found in this branch' });
            }
            resolvedPrinterId = printer_id;
        }

        const result = await pool.query(
            `INSERT INTO print_jobs
                (branch_id, content, target, status, printer_id, queued_by, idempotency_key, service_type)
             VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7)
             RETURNING id`,
            [
                targetBranch,
                content,
                target || 'COUNTER',
                resolvedPrinterId,
                req.user?.id || null,
                idempotency_key || null,
                service_type || null,
            ]
        );

        const jobId = result.rows[0].id;

        emitEvent('print:new_job', {
            id: jobId,
            branchId: targetBranch,
            target: target || 'COUNTER',
            printer_id: resolvedPrinterId,
            service_type: service_type || null,
            content
        }, targetBranch);

        res.json({ success: true, jobId });
    } catch (err) {
        logger.error('Queue print error', err);
        res.status(500).json({ error: 'Failed to queue print job' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/print/jobs — paginated job history for admins / branch managers
// ---------------------------------------------------------------------------
const getJobHistory = async (req, res) => {
    try {
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const userBranchId = req.user.branch_id || req.user.branchId;
        const branchId = isAdmin ? (req.query.branchId || userBranchId) : userBranchId;
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const offset = (page - 1) * limit;
        const status = req.query.status || null;

        const params = [branchId, limit, offset];
        const statusClause = status ? `AND j.status = $${params.push(status)}` : '';
        const countParams = [branchId];
        const countStatusClause = status ? `AND j.status = $${countParams.push(status)}` : '';

        const [rows, count] = await Promise.all([
            pool.query(
                `SELECT j.id, j.status, j.service_type, j.target, j.retry_count,
                        j.error_message, j.created_at, j.updated_at,
                        p.name AS printer_name,
                        u.username AS queued_by_name
                 FROM print_jobs j
                 LEFT JOIN printers p ON p.id = j.printer_id
                 LEFT JOIN users u    ON u.id = j.queued_by
                 WHERE j.branch_id = $1 ${statusClause}
                   AND j.created_at >= NOW() - INTERVAL '7 DAYS'
                 ORDER BY j.created_at DESC
                 LIMIT $2 OFFSET $3`,
                params
            ),
            pool.query(
                `SELECT COUNT(*) FROM print_jobs j
                 WHERE j.branch_id = $1 ${countStatusClause}
                   AND j.created_at >= NOW() - INTERVAL '7 DAYS'`,
                countParams
            ),
        ]);

        res.json({
            data: rows.rows,
            pagination: {
                total: parseInt(count.rows[0].count),
                page,
                limit,
                totalPages: Math.ceil(parseInt(count.rows[0].count) / limit),
            }
        });
    } catch (err) {
        logger.error('Get job history error', err);
        res.status(500).json({ error: 'Failed to fetch job history' });
    }
};

// ---------------------------------------------------------------------------
// Shared helper — build template data from a raw transaction object
// Works for KOT, RECEIPT, CUSTOM_ORDER, INVOICE, PAYOUT, etc.
// ---------------------------------------------------------------------------
const prepareTransactionData = (transaction, branchName) => {
    const tz = process.env.TZ || 'UTC';
    const ts = new Date(transaction.timestamp || Date.now());
    const isPOSN = transaction.type === 'POS-N' || transaction.staffId === 'POS-N';

    const mopMap = {
        CASH: 'Cash', CREDIT: 'Credit', STAFF: 'Credit',
        FONEPAY: 'Fonepay', VISA: 'Credit Card', CREDITCARD: 'Credit Card',
    };
    const rawMop = (transaction.paymentMethod || transaction.mop || '').toUpperCase();
    const paymentMethod = mopMap[rawMop] || transaction.paymentMethod || 'Cash';

    return {
        branchName: branchName || 'CafeFlow',
        orderId: (transaction.id || '').substring(0, 8),
        orderNumber: transaction.orderNumber || '',
        timestamp: ts.toLocaleString('en-US', { timeZone: tz }),
        date: ts.toLocaleDateString('en-US', { timeZone: tz }),
        time: ts.toLocaleTimeString('en-US', { timeZone: tz }),
        printTime: new Date().toLocaleTimeString('en-US', { timeZone: tz }),
        staffName: transaction.staffName || '',
        cashierName: transaction.cashierName || transaction.staffName || 'Staff',
        customerName: transaction.customerName || transaction.consumerName || transaction.staffName || 'Guest',
        paymentMethod,
        orderType: isPOSN ? 'POS-N' : 'Standard',
        transactionType: transaction.type || 'SALE',
        totalAmount: Number(transaction.totalAmount || 0).toFixed(2),
        subtotal: Number(transaction.totalAmount || 0).toFixed(2),
        tax: '0.00',
        eventName: transaction.eventName || '—',
        eventBy: transaction.eventBy || '—',
        itemCount: String((transaction.items || []).length),
        items: (transaction.items || []).map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: Number(item.price || 0).toFixed(2),
            itemTotal: (Number(item.price || 0) * (item.quantity || 1)).toFixed(2),
            remarks: item.remarks || '',
        })),
    };
};

// ---------------------------------------------------------------------------
// POST /api/print/submit — unified print submission
// Body: { serviceType, transaction, cashierName? }
// Resolves the printer, then:
//   - If printer has ip_address → prints directly via TCP (ESC/POS)
//   - If printer has no ip_address but mode=LOCAL → returns HTML to client
//   - Otherwise → returns OFF
// ---------------------------------------------------------------------------
const submitPrint = async (req, res) => {
    try {
        const { serviceType, transaction, cashierName } = req.body;
        if (!serviceType || !transaction) {
            return res.status(400).json({ error: 'serviceType and transaction required' });
        }

        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const userBranchId = req.user.branch_id || req.user.branchId;
        // Admin users may operate the POS in a branch different from their home branch.
        // Use the transaction's branchId as the effective context, falling back to the JWT branch.
        const branchId = (isAdmin && transaction?.branchId) ? transaction.branchId : userBranchId;
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });

        const printer = await getPrinterForService(branchId, serviceType);
        if (!printer) return res.json({ mode: 'OFF' });

        // Fetch branch name and template in parallel — both paths need them
        const [branchRes, tplRes] = await Promise.all([
            pool.query('SELECT name FROM branches WHERE id = $1', [branchId]),
            pool.query(
                `SELECT template_html, template_css FROM document_templates
                 WHERE type = $1 AND is_active = true
                   AND (branch_id = $2 OR branch_id IS NULL)
                 ORDER BY is_default DESC, CASE WHEN branch_id = $2 THEN 0 ELSE 1 END
                 LIMIT 1`,
                [serviceType, branchId]
            ),
        ]);
        const branchName = branchRes.rows[0]?.name || 'CafeFlow';

        const data = {
            ...prepareTransactionData(transaction, branchName),
            cashierName: cashierName || transaction.cashierName || transaction.staffName || 'Staff',
        };

        if (printer.ip_address) {
            const idemKey = `${serviceType.toLowerCase()}-${transaction.id}`;

            const jobRes = await pool.query(
                `INSERT INTO print_jobs
                    (branch_id, content, target, status, printer_id, queued_by, idempotency_key, service_type)
                 VALUES ($1, $2, 'COUNTER', 'PENDING', $3, $4, $5, $6)
                 ON CONFLICT (idempotency_key) DO NOTHING
                 RETURNING id`,
                [
                    branchId,
                    JSON.stringify({ type: 'NETWORK', serviceType, orderId: data.orderId }),
                    printer.id,
                    req.user?.id || null,
                    idemKey,
                    serviceType,
                ]
            );
            if (!jobRes.rows.length) {
                return res.json({ mode: 'NETWORK', printed: false, duplicate: true });
            }
            const jobId = jobRes.rows[0].id;

            try {
                // Network printing always uses hardcoded ESC/POS format (templateHtml=null)
                await printViaNetwork(printer, data, serviceType, null);
                await pool.query(
                    "UPDATE print_jobs SET status = 'PRINTED', updated_at = NOW() WHERE id = $1",
                    [jobId]
                );
                return res.json({ mode: 'NETWORK', printed: true });
            } catch (printErr) {
                logger.error(`submitPrint TCP error [${serviceType}]`, printErr);
                await pool.query(
                    "UPDATE print_jobs SET status = 'FAILED', error_message = $1, updated_at = NOW() WHERE id = $2",
                    [printErr.message, jobId]
                );
                return res.json({ mode: 'NETWORK', printed: false, error: printErr.message });
            }
        }

        if (printer.mode === 'LOCAL') {
            if (!tplRes.rows.length) {
                return res.status(422).json({ error: `No active document template found for ${serviceType}` });
            }
            const html = renderDocumentTemplate(tplRes.rows[0].template_html, tplRes.rows[0].template_css || '', data);
            return res.json({ mode: 'LOCAL', html });
        }

        return res.json({ mode: 'OFF' });
    } catch (err) {
        logger.error('submitPrint error', err);
        res.status(500).json({ error: 'Print submission failed' });
    }
};

module.exports = {
    queuePrintJob,
    getJobHistory,
    submitPrint,
};
