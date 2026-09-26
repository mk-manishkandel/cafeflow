const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool, connectWithTimeout } = require('../config/db.cjs');
const { logAction } = require('../utils/actions.cjs');
const { logFinancialEntry, logFinancialEntries } = require('../utils/ledger.cjs');
const { cacheGet, cacheSet, cacheInvalidatePattern, CACHE_TTL } = require('../redis.cjs');
const { sendEmail, getEmailConfig } = require('../email.cjs');
const { getParsedTemplate } = require('./setupController.cjs');
const { replacePlaceholders } = require('../utils/template.cjs');
const { generateReportBuffer } = require('../utils/reportGenerator.cjs');
const logger = require('../utils/logger.cjs');
const { emitEvent } = require('../socket.cjs');

const getStaff = async (req, res) => {
    try {
        const { page, limit, search, sortBy, sortOrder, status } = req.query;

        // Legacy / Full fetch (if no parameters or specific flag)
        // Wraps existing behavior while supporting server-side pagination if requested.

        if (page) {
            const pageNum = Math.max(1, parseInt(page) || 1);
            const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 200);
            const offset = (pageNum - 1) * limitNum;
            const params = [];
            let conditions = [];

            // Granular Cache Key for paginated search
            const statusKey = status ? status.toUpperCase() : 'ACTIVE';
            const cacheKey = `staff:paginated:${search || 'none'}:${sortBy || 'default'}:${sortOrder || 'asc'}:${pageNum}:${limitNum}:${statusKey}`;
            const cached = await cacheGet(cacheKey);
            if (cached) return res.json(cached);

            // Filter by status: ALL = no filter, INACTIVE = inactive only, default = ACTIVE only
            if (!status || status.toUpperCase() !== 'ALL') {
                const allowedStatuses = ['ACTIVE', 'INACTIVE'];
                const statusVal = status && allowedStatuses.includes(status.toUpperCase()) ? status.toUpperCase() : 'ACTIVE';
                params.push(statusVal);
                conditions.push(`status = $${params.length}`);
            }

            if (search) {
                params.push(`%${search}%`);
                const i = params.length;
                conditions.push(`(name ILIKE $${i} OR email ILIKE $${i} OR mobile_number ILIKE $${i} OR department ILIKE $${i})`);
            }

            const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
            const countRes = await pool.query(`SELECT COUNT(*) FROM staff${whereClause}`, params);

            let sortClause = 'ORDER BY id ASC';
            if (sortBy) {
                const direction = (sortOrder && sortOrder.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
                const sortMap = {
                    'name': 'name',
                    'email': 'email',
                    'department': 'department',
                    'monthlyAllowance': 'monthly_allowance',
                    'currentBalance': 'current_balance',
                    'payable': 'current_balance',
                    'spent': 'monthly_allowance'
                };
                const dbCol = sortMap[sortBy];
                if (dbCol) {
                    if (sortBy === 'spent') {
                        sortClause = `ORDER BY (monthly_allowance - current_balance) ${direction}`;
                    } else if (sortBy === 'payable') {
                        sortClause = `ORDER BY CASE WHEN current_balance < 0 THEN ABS(current_balance) ELSE 0 END ${direction}`;
                    } else {
                        sortClause = `ORDER BY ${dbCol} ${direction}`;
                    }
                }
            }

            const query = `SELECT * FROM staff${whereClause} ${sortClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            const finalParams = [...params, limitNum, offset];

            const result = await pool.query(query, finalParams);

            const staffList = result.rows.map(row => {
                const monthlyAllowance = parseFloat(row.monthly_allowance);
                const currentBalance = parseFloat(row.current_balance);
                return {
                    id: row.id.toString(),
                    name: row.name,
                    email: row.email,
                    mobileNumber: row.mobile_number,
                    department: row.department,
                    monthlyAllowance,
                    currentBalance,
                    spent: monthlyAllowance - currentBalance,
                    payable: currentBalance < 0 ? Math.abs(currentBalance) : 0,
                    avatar: row.avatar,
                    status: row.status || 'ACTIVE'
                };
            });

            const responseData = {
                data: staffList,
                pagination: {
                    total: parseInt(countRes.rows[0].count),
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(parseInt(countRes.rows[0].count) / limitNum)
                }
            };

            await cacheSet(cacheKey, responseData, CACHE_TTL.STAFF);
            return res.json(responseData);
        }

        // Fallback to cached all-fetch for compatibility with other parts of app (e.g. Transactions dropdown)
        const cacheKey = 'staff:all';
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const result = await pool.query('SELECT * FROM staff ORDER BY id');
        const staff = result.rows.map(row => {
            const monthlyAllowance = parseFloat(row.monthly_allowance);
            const currentBalance = parseFloat(row.current_balance);
            return {
                id: row.id.toString(),
                name: row.name,
                email: row.email,
                mobileNumber: row.mobile_number,
                department: row.department,
                monthlyAllowance,
                currentBalance,
                spent: monthlyAllowance - currentBalance,
                payable: currentBalance < 0 ? Math.abs(currentBalance) : 0,
                avatar: row.avatar,
                status: row.status || 'ACTIVE'
            };
        });
        await cacheSet(cacheKey, staff, CACHE_TTL.STAFF);
        res.json(staff);

    } catch (err) {
        logger.error('Get staff error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const createStaff = async (req, res) => {
    const { name, email, mobileNumber, department, monthlyAllowance, currentBalance, avatar, status, branchId: requestedBranchId } = req.body;
    // NOT NULL in Postgres does not reject empty strings — enforce non-blank here explicitly.
    if (!name || !String(name).trim() || !email || !String(email).trim()) {
        return res.status(400).json({ error: 'Name and email are required' });
    }
    // Branch isolation: non-admins (including API keys) always create within their own
    // branch, ignoring any client-supplied branchId. Admins may target any branch, or
    // omit branchId for a global (branch_id = NULL) record.
    const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
    const effectiveBranchId = isAdmin ? (requestedBranchId ?? null) : (req.user?.branchId ?? null);
    try {
        await pool.query(
            'INSERT INTO staff (id, name, email, mobile_number, department, monthly_allowance, current_balance, avatar, status, branch_id) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [
                name,
                email,
                mobileNumber || null,
                department || null,
                monthlyAllowance || 0,
                currentBalance || 0,
                avatar || null,
                status || 'ACTIVE',
                effectiveBranchId
            ]
        );
        await cacheInvalidatePattern('staff:*');
        emitEvent('data:updated', { type: 'staff' }, null);
        logAction(req.user?.id, req.user?.username, 'CREATE_STAFF', `Created staff ${name} (${email})`, effectiveBranchId);
        res.json({ success: true });
    } catch (err) {
        logger.error('Create staff error', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: 'Database error' });
    }
};

const updateStaff = async (req, res) => {
    const { id } = req.params;
    const { name, email, mobileNumber, department, monthlyAllowance, currentBalance, avatar, status } = req.body;
    if (!name || !String(name).trim() || !email || !String(email).trim()) {
        return res.status(400).json({ error: 'Name and email are required' });
    }
    const client = await connectWithTimeout(pool);
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;

        // DB-M: FOR UPDATE serializes manual balance overrides with concurrent sales
        const currentRes = await client.query('SELECT current_balance FROM staff WHERE id = $1 FOR UPDATE', [id]);
        if (currentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Staff not found' });
        }
        const oldBalance = parseFloat(currentRes.rows[0].current_balance);

        let newBalance = oldBalance;
        if (currentBalance !== undefined && parseFloat(currentBalance) !== oldBalance) {
            if (!isAdmin) {
                await client.query('ROLLBACK');
                logger.warn(`Privilege Escalation Attempt: User ${req.user?.username} tried to manually adjust staff balance for ID ${id}`);
                return res.status(403).json({ error: 'Only administrators can manually adjust staff balances' });
            }
            newBalance = parseFloat(currentBalance);
        }

        await client.query(
            'UPDATE staff SET name = $1, email = $2, mobile_number = $3, department = $4, monthly_allowance = $5, current_balance = $6, avatar = $7, status = $8 WHERE id = $9',
            [
                name,
                email,
                mobileNumber || null,
                department || null,
                monthlyAllowance,
                newBalance,
                avatar || null,
                status || 'ACTIVE',
                id
            ]
        );

        if (oldBalance !== newBalance) {
            // Use the transaction client so the ledger entry is atomic with the balance update
            await logFinancialEntry({
                entityType: 'STAFF',
                entityId: id,
                amount: Math.abs(newBalance - oldBalance),
                type: newBalance > oldBalance ? 'CREDIT' : 'DEBIT',
                balanceBefore: oldBalance,
                balanceAfter: newBalance,
                branchId: req.user?.branchId,
                reason: 'Manual Balance Adjustment'
            }, client);
        }

        await client.query('COMMIT');
        await cacheInvalidatePattern('staff:*');
        emitEvent('data:updated', { type: 'staff' }, null);
        logAction(req.user?.id, req.user?.username, 'UPDATE_STAFF', `Updated staff ${name} (ID: ${id})`, req.user?.branchId);
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Update staff error', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
};

const deleteStaff = async (req, res) => {
    const { id } = req.params;
    try {
        // DB-C8: soft delete — set status to INACTIVE rather than hard DELETE
        // This preserves transaction history and financial ledger integrity.
        await pool.query("UPDATE staff SET status = 'INACTIVE' WHERE id = $1", [id]);
        await cacheInvalidatePattern('staff:*');
        emitEvent('data:updated', { type: 'staff' }, null);
        logAction(req.user?.id, req.user?.username, 'DELETE_STAFF', `Deactivated staff ID ${id}`, req.user?.branchId);
        res.json({ success: true });
    } catch (err) {
        logger.error('Delete staff error', err);
        res.status(500).json({ error: 'Database error' });
    }
};

const resetAllowances = async (req, res) => {
    const client = await connectWithTimeout(pool);
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // RBAC-H6: scope the reset to the acting user's branch when branch_id is
        // populated on the staff table (migration: add_staff_branch_id.sql).
        // If branch_id is NULL on any staff rows (pre-backfill legacy data) those
        // rows fall outside the per-branch filter — a warning is emitted so ops
        // teams can track backfill progress without breaking existing behaviour.
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        const actingBranchId = req.user?.branchId ?? null;

        let branchFilter = '';
        const branchParams = [];

        if (!isAdmin && actingBranchId) {
            // Check whether any staff rows have branch_id populated. If none do yet
            // (i.e. column exists but backfill hasn't run), fall back to global reset
            // with a loud warning rather than silently resetting zero rows.
            const backfillCheck = await client.query(
                "SELECT COUNT(*) AS total, COUNT(branch_id) AS with_branch FROM staff WHERE status = 'ACTIVE'"
            );
            const total = parseInt(backfillCheck.rows[0].total, 10);
            const withBranch = parseInt(backfillCheck.rows[0].with_branch, 10);

            if (total > 0 && withBranch === 0) {
                // Column exists but no rows have been backfilled — warn and fall through
                // to global reset so the operation remains functional during transition.
                logger.warn(
                    `RBAC-H6 degraded mode: staff.branch_id column exists but no rows are populated. ` +
                    `resetAllowances by user ${req.user?.username} (branch: ${actingBranchId}) ` +
                    `will reset ALL active staff until backfill completes.`
                );
            } else {
                branchFilter = " AND branch_id = $1";
                branchParams.push(actingBranchId);
            }
        }

        // Filter to ACTIVE staff only to avoid resetting INACTIVE (deleted) staff
        const currentStaff = await client.query(
            `SELECT id, name, email, mobile_number, department, monthly_allowance, current_balance, avatar FROM staff WHERE status = 'ACTIVE'${branchFilter}`,
            branchParams
        );

        await client.query(
            `UPDATE staff SET current_balance = monthly_allowance WHERE status = 'ACTIVE'${branchFilter}`,
            branchParams
        );

        const ledgerEntries = [];
        for (const s of currentStaff.rows) {
            const oldBalance = parseFloat(s.current_balance);
            const newBalance = parseFloat(s.monthly_allowance);
            if (oldBalance === newBalance) continue;
            ledgerEntries.push({
                entityType: 'STAFF',
                entityId: s.id.toString(),
                amount: Math.abs(newBalance - oldBalance),
                type: newBalance > oldBalance ? 'CREDIT' : 'DEBIT',
                balanceBefore: oldBalance,
                balanceAfter: newBalance,
                branchId: req.user?.branchId,
                reason: 'Monthly Allowance Reset'
            });
        }
        await logFinancialEntries(ledgerEntries, client);

        // Issue 1 (HIGH): Insert individual audit log entries for each affected staff member
        // using a single bulk INSERT for performance (avoids N individual round-trips).
        if (currentStaff.rows.length > 0) {
            const auditValues = [];
            const auditParams = [];
            let paramIdx = 1;
            for (const s of currentStaff.rows) {
                const previousBalance = parseFloat(s.current_balance);
                const newBalance = parseFloat(s.monthly_allowance);
                const detailsJson = JSON.stringify({
                    action: 'RESET_ALLOWANCE',
                    target_id: s.id.toString(),
                    performed_by: req.user?.id,
                    details: {
                        previous_balance: previousBalance,
                        new_balance: newBalance,
                        branch_id: req.user?.branchId ?? null
                    }
                });
                auditValues.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                auditParams.push(
                    req.user?.id ?? null,
                    req.user?.username ?? 'system',
                    'RESET_ALLOWANCE',
                    detailsJson,
                    req.user?.branchId ?? null
                );
            }
            if (auditValues.length > 0) {
                await client.query(
                    `INSERT INTO audit_logs (user_id, user_name, action, details, branch_id)
                     VALUES ${auditValues.join(', ')}`,
                    auditParams
                );
            }
        }

        await client.query('COMMIT');
        await cacheInvalidatePattern('staff:*');
        emitEvent('data:updated', { type: 'staff' }, null);

        // Build response from pre-UPDATE snapshot — after reset, currentBalance = monthlyAllowance
        const staff = currentStaff.rows.map(row => ({
            id: row.id.toString(),
            name: row.name,
            email: row.email,
            mobileNumber: row.mobile_number,
            department: row.department,
            monthlyAllowance: parseFloat(row.monthly_allowance),
            currentBalance: parseFloat(row.monthly_allowance),
            avatar: row.avatar
        }));

        // Notify System Admin
        const config = await getEmailConfig();
        if (config.systemAdminRecipient && config.host) {
            const template = await getParsedTemplate('email_template_staff_reset');
            const { getSafeTimezone } = require('../utils/timezone.cjs');
            const data = {
                month: new Date().toLocaleString('en-US', { month: 'long' }),
                year: new Date().getFullYear(),
                username: req.user?.username || 'Unknown',
                totalStaff: staff.length,
                resetAmount: 'Dynamic',
                resetDate: new Date().toLocaleDateString(),
                date: new Date().toLocaleString('en-US', { timeZone: getSafeTimezone() })
            };

            const subject = replacePlaceholders(template.subject, data);
            const html = replacePlaceholders(template.body, data);
            sendEmail(config.systemAdminRecipient, subject, html).catch(err => logger.error('Failed to send reset allowances email', err));
        }

        res.json(staff);
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Reset allowances error', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
};

const resetSingleAllowance = async (req, res) => {
    const { id } = req.params;
    const client = await connectWithTimeout(pool);
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        const staffRes = await client.query(
            'SELECT id, name, monthly_allowance, current_balance FROM staff WHERE id = $1', [id]
        );
        if (staffRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Staff not found' });
        }

        const staff = staffRes.rows[0];
        const oldBalance = parseFloat(staff.current_balance);
        const newBalance = parseFloat(staff.monthly_allowance);

        if (oldBalance !== newBalance) {
            await client.query('UPDATE staff SET current_balance = monthly_allowance WHERE id = $1', [id]);
            await logFinancialEntry({
                entityType: 'STAFF',
                entityId: id,
                amount: Math.abs(newBalance - oldBalance),
                type: newBalance > oldBalance ? 'CREDIT' : 'DEBIT',
                balanceBefore: oldBalance,
                balanceAfter: newBalance,
                branchId: req.user?.branchId,
                reason: 'Monthly Allowance Reset'
            }, client);
        }

        await client.query('COMMIT');
        await cacheInvalidatePattern('staff:*');
        emitEvent('data:updated', { type: 'staff' }, null);
        logAction(req.user?.id, req.user?.username, 'RESET_ALLOWANCE', `Reset allowance for staff: ${staff.name}`, req.user?.branchId);
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Reset single staff allowance error', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
};

const BULK_IMPORT_MAX = 500;

const bulkImport = async (req, res) => {
    const { staffList, branchId: requestedBranchId } = req.body;
    if (!Array.isArray(staffList) || staffList.length === 0) return res.status(400).json({ error: 'No staff data provided' });
    if (staffList.length > BULK_IMPORT_MAX) return res.status(400).json({ error: `Bulk import limit is ${BULK_IMPORT_MAX} staff per request` });

    // RBAC: Enforce branch isolation. Non-admin users can only import staff into
    // their own branch. Admins may specify any branch (or omit to use their own).
    const actorRole = req.user?.role?.toLowerCase();
    const isAdmin = actorRole === ROLES.ADMIN;
    const actorBranchId = req.user?.branchId;

    // Resolve the effective branch for this import.
    const effectiveBranchId = isAdmin
        ? (requestedBranchId ?? actorBranchId)
        : actorBranchId; // non-admins always use their own branch, ignoring any requested value

    // Non-admins: reject if caller explicitly passed a different branchId.
    if (!isAdmin && requestedBranchId !== undefined && requestedBranchId !== actorBranchId) {
        return res.status(403).json({
            success: false,
            error: { code: 'BRANCH_ACCESS_DENIED', message: 'Cannot create staff for another branch' }
        });
    }

    // Validate that no individual record tries to override to a different branch.
    const offendingRecord = staffList.find(
        s => s.branchId !== undefined && s.branchId !== effectiveBranchId
    );
    if (offendingRecord && !isAdmin) {
        return res.status(403).json({
            success: false,
            error: { code: 'BRANCH_ACCESS_DENIED', message: 'Cannot create staff for another branch' }
        });
    }

    const client = await connectWithTimeout(pool);
    let created = 0, updated = 0, errors = [];

    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const ledgerEntries = [];
        for (const staff of staffList) {
            const { name, email, mobileNumber, department, monthlyAllowance } = staff;
            if (!name || !email || !department || monthlyAllowance === undefined) {
                errors.push(`Missing required fields for: ${name || email || 'unknown'}`);
                continue;
            }
            const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
            const existing = await client.query('SELECT id, monthly_allowance, current_balance FROM staff WHERE email = $1', [email]);

            if (existing.rows.length > 0) {
                const oldStaff = existing.rows[0];
                const previouslySpent = parseFloat(oldStaff.monthly_allowance) - parseFloat(oldStaff.current_balance);
                const newBalance = parseFloat(monthlyAllowance) - previouslySpent;

                await client.query('UPDATE staff SET name = $1, mobile_number = $2, department = $3, monthly_allowance = $4, current_balance = $5, avatar = $6, branch_id = $7 WHERE email = $8', [name, mobileNumber || null, department, monthlyAllowance, newBalance, avatar, effectiveBranchId, email]);

                ledgerEntries.push({
                    entityType: 'STAFF',
                    entityId: oldStaff.id,
                    amount: Math.abs(newBalance - parseFloat(oldStaff.current_balance)),
                    type: newBalance >= parseFloat(oldStaff.current_balance) ? 'CREDIT' : 'DEBIT',
                    balanceBefore: parseFloat(oldStaff.current_balance),
                    balanceAfter: newBalance,
                    branchId: effectiveBranchId,
                    reason: 'Bulk Import Update'
                });

                updated++;
            } else {
                const insertRes = await client.query('INSERT INTO staff (id, name, email, mobile_number, department, monthly_allowance, current_balance, avatar, branch_id) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, $6, $7) RETURNING id', [name, email, mobileNumber || null, department, monthlyAllowance, avatar, effectiveBranchId]);
                const newStaffId = insertRes.rows[0].id;

                ledgerEntries.push({
                    entityType: 'STAFF',
                    entityId: newStaffId,
                    amount: parseFloat(monthlyAllowance),
                    type: 'CREDIT',
                    balanceBefore: 0,
                    balanceAfter: parseFloat(monthlyAllowance),
                    branchId: effectiveBranchId,
                    reason: 'Initial Bulk Import'
                });

                created++;
            }
        }
        if (ledgerEntries.length > 0) await logFinancialEntries(ledgerEntries, client);
        await client.query('COMMIT');
        await cacheInvalidatePattern('staff:*');
        logAction(req.user?.id, req.user?.username, 'BULK_IMPORT', `Imported staff: ${created} created, ${updated} updated`, effectiveBranchId);
        emitEvent('data:updated', { type: 'staff' }, null);

        // Notify System Admin
        const config = await getEmailConfig();
        if (config.systemAdminRecipient && config.host) {
            const template = await getParsedTemplate('email_template_staff_bulk_import');
            const errorListHtml = errors.length > 0 ? `
                <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 15px; margin-top: 20px;">
                    <h4 style="color: #991b1b; margin-top: 0;">Error Details</h4>
                    <ul style="color: #b91c1c; margin-bottom: 0; padding-left: 20px;">
                        ${errors.map(e => `<li>${e}</li>`).join('')}
                    </ul>
                </div>
            ` : '';

            const data = {
                date: new Date().toLocaleString('en-US', { timeZone: process.env.TZ || 'UTC' }),
                username: req.user?.username || 'Unknown',
                totalImported: staffList.length,
                successCount: created + updated,
                failCount: errors.length,
                errorCount: errors.length,
                errorList: errorListHtml
            };

            const subject = replacePlaceholders(template.subject, data);
            const html = replacePlaceholders(template.body, data, false); // false because errorList is already HTML
            sendEmail(config.systemAdminRecipient, subject, html).catch(err => logger.error('Failed to send bulk import email', err));
        }

        res.json({ success: true, created, updated, errors });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Bulk import error', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};


// getCellText removed in favor of centralized utility in reportGenerator.cjs

const exportStaff = async (req, res) => {
    try {
        
        const staffQuery = `
            SELECT id, name, email, mobile_number, department,
                   COALESCE(monthly_allowance, 0) AS monthly_allowance,
                   COALESCE(current_balance, 0) AS current_balance
            FROM staff
            WHERE status = 'ACTIVE'
            ORDER BY name
            LIMIT 10000`;

        const staffResult = await pool.query(staffQuery);
        const data = staffResult.rows.map(s => {
            const monthly = parseFloat(s.monthly_allowance) || 0;
            const balance = parseFloat(s.current_balance) || 0;
            const spent = monthly - balance;
            const payable = balance < 0 ? Math.abs(balance) : 0;

            return {
                'ID': s.id,
                'Name': s.name,
                'Email': s.email || '',
                'Mobile': s.mobile_number || '',
                'Department': s.department || '',
                'Monthly Allowance (Rs)': monthly,
                'Spent (Rs)': spent,
                'Payable (Rs)': payable
            };
        });

        const buffer = await generateReportBuffer('STAFF_LIST', data, {
            username: req.user?.username,
            moduleName: 'Staff Management'
        });

        logAction(req.user?.id, req.user?.username, 'EXPORT_STAFF', `Exported Staff List`, req.user?.branchId);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="staff_list_${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        logger.error('Error exporting staff list:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    getStaff, createStaff, updateStaff, deleteStaff,
    resetAllowances, resetSingleAllowance, bulkImport, exportStaff
};
