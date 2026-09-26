const { pool } = require('../config/db.cjs');
const logger = require('../utils/logger.cjs');
const { getSafeTimezone } = require('../utils/timezone.cjs');
const { sendEmail } = require('../email.cjs');
const { studentOrderConfirmationTemplate } = require('../templates/studentOrderConfirmation.cjs');
const { ROLES } = require('../utils/roleHierarchy.cjs');

const ORDER_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;

/**
 * Branch the cashier is operating in. Non-admins are pinned to their own branch;
 * admins (who can switch branch in the POS header) send it as ?branchId=.
 */
function getActingBranchId(req) {
    const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
    return isAdmin ? (req.query.branchId || null) : (req.user?.branchId ?? null);
}

/**
 * Loads the order and verifies it belongs to the acting branch.
 * Sends the error response and returns null on failure.
 */
async function loadOrderForActingBranch(req, res, orderId) {
    const actingBranchId = getActingBranchId(req);
    if (!actingBranchId) {
        res.status(400).json({ error: 'Select a branch before processing student orders.' });
        return null;
    }
    const result = await pool.query(
        `SELECT so.id, so.student_email, so.branch_id, so.items, so.total_amount,
                so.status, so.created_at, b.name AS branch_name
         FROM student_orders so
         LEFT JOIN branches b ON so.branch_id = b.id
         WHERE so.id = $1`,
        [orderId]
    );
    if (result.rows.length === 0) {
        res.status(404).json({ error: 'Order not found.' });
        return null;
    }
    const order = result.rows[0];
    if (String(order.branch_id) !== String(actingBranchId)) {
        logger.warn(`[StudentOrder] Branch mismatch: order ${orderId} (branch ${order.branch_id}) accessed from branch ${actingBranchId} by user ${req.user?.id}`);
        res.status(403).json({ error: `This order belongs to ${order.branch_name || 'another branch'} and cannot be processed here.` });
        return null;
    }
    return order;
}

/**
 * Builds an order ID (YYYY-MM-DD-NNNN) from the business-local date and sequence.
 */
function formatOrderId(dateStr, seq) {
    return `${dateStr}-${String(seq).padStart(4, '0')}`;
}

/**
 * POST /api/public/student-orders
 * Creates a student pre-order, sends confirmation email, returns orderId.
 */
const createStudentOrder = async (req, res) => {
    const { sessionId, branchId, studentEmail, items, totalAmount } = req.body;

    // Merge duplicate lines for the same item so each menu item is priced once.
    const quantities = new Map();
    for (const item of items) {
        const id = String(item.id);
        quantities.set(id, (quantities.get(id) || 0) + parseInt(item.quantity, 10));
    }

    let client;
    try {
        client = await pool.connect();

        // Verify session exists and is not abandoned
        const sessionRes = await client.query(
            `SELECT s.id, s.branch_id, b.name AS branch_name, b.is_self_service_enabled
             FROM fnb_sessions s
             JOIN branches b ON s.branch_id = b.id
             WHERE s.id = $1 AND s.branch_id = $2 AND s.status != 'ABANDONED'`,
            [sessionId, branchId]
        );

        if (sessionRes.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session. Please refresh the page.' });
        }

        const session = sessionRes.rows[0];

        if (!session.is_self_service_enabled) {
            return res.status(403).json({ error: 'Online ordering is currently disabled for this branch.' });
        }

        // Verify branch allows self-service (belt-and-suspenders)
        const branchRes = await client.query(
            `SELECT id, name FROM branches WHERE id = $1 AND is_active = true`,
            [branchId]
        );
        if (branchRes.rows.length === 0) {
            return res.status(400).json({ error: 'Branch not found.' });
        }
        const branchName = branchRes.rows[0].name;

        // PRICE INTEGRITY: never trust client-supplied name/price/category.
        // Re-read every item from the menu with the same visibility rules as the
        // student menu (this branch, self-service, available, not deleted).
        const menuRes = await client.query(
            `SELECT id::text AS id, name, price, category
             FROM menu
             WHERE id::text = ANY($1::text[])
               AND branch_id = $2
               AND is_self_service = true
               AND available = true
               AND is_deleted = false`,
            [[...quantities.keys()], branchId]
        );
        if (menuRes.rows.length !== quantities.size) {
            return res.status(400).json({ error: 'One or more items are no longer available. Please refresh the menu and try again.' });
        }

        const enrichedItems = menuRes.rows.map(row => {
            const quantity = quantities.get(row.id);
            const price = parseFloat(row.price);
            return {
                id: row.id,
                name: row.name,
                price,
                category: row.category || '',
                quantity,
                itemTotal: price * quantity
            };
        });
        const computedTotal = enrichedItems.reduce((sum, item) => sum + item.itemTotal, 0);

        // Reject if the total the student saw differs from real menu prices
        // (stale menu or tampered request) instead of silently charging a different amount.
        if (Math.abs(computedTotal - parseFloat(totalAmount)) > 0.01) {
            return res.status(400).json({ error: 'Menu prices have changed. Please refresh the menu and try again.' });
        }

        // DUPLICATE-SALE FIX: claim the session atomically BEFORE inserting the
        // order, and perform the claim + order insert inside ONE explicit
        // transaction. The CAS guard (status != 'COMPLETED') ensures a double
        // submit cannot create two pre-orders for the same session.
        await client.query('BEGIN');

        const claimRes = await client.query(
            `UPDATE fnb_sessions SET status = 'COMPLETED', completed_at = NOW()
             WHERE id = $1 AND status != 'COMPLETED'
             RETURNING id`,
            [sessionId]
        );
        if (claimRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'This order has already been submitted. Please refresh the page.' });
        }

        // Atomic order ID generation: increment today's sequence counter.
        // The date prefix and the counter both use the business timezone (TZ),
        // so IDs match the cashier's local date and never reuse a sequence
        // number around UTC midnight.
        const today = new Date();
        const seqRes = await client.query(
            `INSERT INTO student_order_sequences (order_date, last_sequence)
             VALUES ((NOW() AT TIME ZONE $1)::date, 1)
             ON CONFLICT (order_date) DO UPDATE
               SET last_sequence = student_order_sequences.last_sequence + 1
             RETURNING to_char(order_date, 'YYYY-MM-DD') AS order_date, last_sequence`,
            [getSafeTimezone()]
        );
        const { order_date: orderDate, last_sequence: sequence } = seqRes.rows[0];
        const orderId = formatOrderId(orderDate, sequence);

        const clientIp = req.realIp || req.ip;

        // Insert the order
        await client.query(
            `INSERT INTO student_orders
               (id, session_id, branch_id, student_email, items, total_amount, status, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)`,
            [orderId, sessionId, branchId, studentEmail, JSON.stringify(enrichedItems), computedTotal.toFixed(2), clientIp]
        );

        await client.query('COMMIT');

        client.release();
        client = null;

        // Send confirmation email (fire-and-forget — do not block response)
        const { subject, html } = await studentOrderConfirmationTemplate({
            orderId,
            studentEmail,
            items: enrichedItems,
            totalAmount: computedTotal,
            branchName,
            createdAt: today
        });
        sendEmail(studentEmail, subject, html).catch(err => {
            logger.error(`[StudentOrder] Failed to send confirmation email for order ${orderId}:`, err.message);
        });

        logger.info(`[StudentOrder] Created order ${orderId} for ${studentEmail}, branch: ${branchName}, total: ${computedTotal.toFixed(2)}`);

        return res.status(201).json({ orderId });

    } catch (err) {
        // Roll back the explicit transaction if it was still open on failure
        if (client) {
            await client.query('ROLLBACK').catch(() => {});
        }
        logger.error('[StudentOrder] Error creating student order:', err);
        return res.status(500).json({ error: 'Failed to create order. Please try again.' });
    } finally {
        if (client) client.release();
    }
};

/**
 * GET /api/student-orders/:orderId
 * Cashier endpoint: fetch order details to load into POS cart.
 */
const getStudentOrderForPOS = async (req, res) => {
    const { orderId } = req.params;

    if (!ORDER_ID_RE.test(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID format. Expected: YYYY-MM-DD-NNNN' });
    }

    try {
        const order = await loadOrderForActingBranch(req, res, orderId);
        if (!order) return;

        if (order.status === 'CANCELLED') {
            return res.status(410).json({ error: 'This order has been cancelled.' });
        }

        if (order.status === 'COMPLETED') {
            return res.status(409).json({ error: 'This order has already been completed.' });
        }

        return res.json({
            id: order.id,
            studentEmail: order.student_email,
            branchId: order.branch_id,
            branchName: order.branch_name,
            items: order.items,
            totalAmount: parseFloat(order.total_amount),
            status: order.status,
            createdAt: order.created_at
        });

    } catch (err) {
        logger.error('[StudentOrder] Error fetching order for POS:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * POST /api/student-orders/:orderId/load
 * Cashier confirms loading order into POS cart; updates status to LOADED_TO_POS.
 * Re-loading an order that is already LOADED_TO_POS is allowed: the cart is not
 * persisted, so a page refresh before checkout requires loading it again.
 */
const markStudentOrderLoaded = async (req, res) => {
    const { orderId } = req.params;

    if (!ORDER_ID_RE.test(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID format. Expected: YYYY-MM-DD-NNNN' });
    }

    try {
        const order = await loadOrderForActingBranch(req, res, orderId);
        if (!order) return;

        const result = await pool.query(
            `UPDATE student_orders
             SET status = 'LOADED_TO_POS', loaded_at = NOW()
             WHERE id = $1 AND branch_id = $2 AND status IN ('PENDING', 'LOADED_TO_POS')
             RETURNING id`,
            [orderId, order.branch_id]
        );

        if (result.rowCount === 0) {
            // Check if order exists at all
            const check = await pool.query('SELECT status FROM student_orders WHERE id = $1', [orderId]);
            if (check.rows.length === 0) {
                return res.status(404).json({ error: 'Order not found.' });
            }
            const currentStatus = check.rows[0].status;
            return res.status(409).json({ error: `Order cannot be loaded (status: ${currentStatus}).`, status: currentStatus });
        }

        logger.info(`[StudentOrder] Order ${orderId} marked as LOADED_TO_POS by user ${req.user?.id}`);
        return res.json({ success: true });

    } catch (err) {
        logger.error('[StudentOrder] Error marking order as loaded:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * POST /api/student-orders/:orderId/complete
 * Called after POS checkout succeeds; updates status to COMPLETED.
 * Idempotent: completing an already-COMPLETED order returns success.
 */
const markStudentOrderCompleted = async (req, res) => {
    const { orderId } = req.params;

    if (!ORDER_ID_RE.test(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID format. Expected: YYYY-MM-DD-NNNN' });
    }

    try {
        const order = await loadOrderForActingBranch(req, res, orderId);
        if (!order) return;

        const result = await pool.query(
            `UPDATE student_orders
             SET status = 'COMPLETED', completed_at = NOW()
             WHERE id = $1 AND branch_id = $2 AND status IN ('PENDING', 'LOADED_TO_POS')
             RETURNING id`,
            [orderId, order.branch_id]
        );

        if (result.rowCount === 0) {
            const check = await pool.query('SELECT status FROM student_orders WHERE id = $1', [orderId]);
            if (check.rows.length === 0) {
                return res.status(404).json({ error: 'Order not found.' });
            }
            const currentStatus = check.rows[0].status;
            if (currentStatus === 'COMPLETED') {
                return res.json({ success: true });
            }
            return res.status(409).json({ error: `Order cannot be completed (status: ${currentStatus}).`, status: currentStatus });
        }

        logger.info(`[StudentOrder] Order ${orderId} marked as COMPLETED by user ${req.user?.id}`);
        return res.json({ success: true });

    } catch (err) {
        logger.error('[StudentOrder] Error marking order as completed:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    createStudentOrder,
    getStudentOrderForPOS,
    markStudentOrderLoaded,
    markStudentOrderCompleted
};
