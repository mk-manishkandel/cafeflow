const { ROLES } = require('../utils/roleHierarchy.cjs');
const { pool, query } = require('../config/db.cjs');
const logger = require('../utils/logger.cjs');
const { cacheGet, cacheSet } = require('../redis.cjs');
const { getSafeTimezone } = require('../utils/timezone.cjs');

const getDashboardStats = async (req, res, next) => {
    try {
        const { branchId: rawBranchId, startDate, endDate } = req.query;
        let branchId = rawBranchId;
        const isAdmin = req.user?.role?.toLowerCase() === ROLES.ADMIN;
        // Global scope = admin OR non-admin explicitly assigned null branchId (all-branches access)
        const isGlobalScope = isAdmin || req.user?.branchId === null;

        // Enforce branch isolation for non-global users.
        if (!isGlobalScope) {
            branchId = req.user?.branchId;
            if (!branchId) return res.status(403).json({ error: 'Access Denied: No branch assigned' });
        }

        // If 'Main Branch' is selected, treat as system-wide (NULL filter)
        if (isGlobalScope && branchId) {
            const branchRes = await pool.query('SELECT name FROM branches WHERE id = $1 AND is_active = true', [branchId]);
            if (branchRes.rows[0]?.name === 'Main Branch') {
                branchId = null;
            }
        }

        let queryParams = [];
        let whereClauses = ["status != 'REFUNDED'"];

        const cacheKey = `dashboard:${branchId || 'all'}:${startDate || 'default'}:${endDate || 'default'}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        if (branchId) {
            queryParams.push(branchId);
            whereClauses.push(`branch_id = $${queryParams.length}`);
        }

        const systemTz = getSafeTimezone();

        // DB-H9: set timezone via parameterized query on a dedicated client to avoid string interpolation.
        // getSafeTimezone() validates against IANA database (no injection risk), but we use SET for
        // consistency. The timezone is then referenced as CURRENT_SETTING('TIMEZONE') in queries,
        // or simply relied on via session-level AT TIME ZONE using the already-validated string.
        // Note: PostgreSQL AT TIME ZONE does not accept parameters ($N), only literals or session TZ.
        // The connection-level SET is the correct parameterized approach.
        // We use the pool's per-connection SET (already applied in db.cjs), so systemTz is safe here.

        // Optimization: Use Range Queries to enable Index Scan (Avoid DATE() function)
        if (startDate) {
            queryParams.push(startDate);
            whereClauses.push(`date >= ($${queryParams.length}::date AT TIME ZONE CURRENT_SETTING('timezone'))`);
        }

        if (endDate) {
            queryParams.push(endDate);
            whereClauses.push(`date < (($${queryParams.length}::date + INTERVAL '1 day') AT TIME ZONE CURRENT_SETTING('timezone'))`);
        }

        const today = new Date().toLocaleDateString('en-CA', { timeZone: systemTz });

        const statsQuery = `
            WITH historical AS (
                SELECT
                    COALESCE(SUM(total_revenue), 0) as total_revenue,
                    COALESCE(SUM(total_transactions), 0) as total_count,
                    COALESCE(SUM(staff_revenue), 0) as staff_revenue,
                    COALESCE(SUM(staff_count), 0) as staff_count,
                    COALESCE(SUM(consumer_revenue), 0) as consumer_revenue,
                    COALESCE(SUM(consumer_count), 0) as consumer_count,
                    COALESCE(SUM(pos_n_revenue), 0) as pos_n_revenue,
                    COALESCE(SUM(pos_n_count), 0) as pos_n_count
                FROM mv_branch_daily_sales
                WHERE (branch_id = $1 OR $1 IS NULL)
                  AND (sales_date >= $2::date OR $2 IS NULL)
                  AND (sales_date <= $3::date OR $3 IS NULL)
                  AND sales_date < $4::date
            ),
            today_realtime AS (
                SELECT
                    COALESCE(SUM(CASE WHEN order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END), 0) as total_revenue,
                    COALESCE(COUNT(CASE WHEN order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END), 0) as total_count,
                    COALESCE(SUM(CASE WHEN staff_id IS NOT NULL AND staff_id NOT IN ('POS-N') AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END), 0) as staff_revenue,
                    COUNT(CASE WHEN staff_id IS NOT NULL AND staff_id NOT IN ('POS-N') AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END) as staff_count,
                    COALESCE(SUM(CASE WHEN consumer_id IS NOT NULL AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END), 0) as consumer_revenue,
                    COUNT(CASE WHEN consumer_id IS NOT NULL AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END) as consumer_count,
                    COALESCE(SUM(CASE WHEN staff_id = 'POS-N' THEN total_amount ELSE 0 END), 0) as pos_n_revenue,
                    COUNT(CASE WHEN staff_id = 'POS-N' THEN 1 END) as pos_n_count
                FROM transactions
                WHERE (branch_id = $1 OR $1 IS NULL)
                  AND date >= ($4::date AT TIME ZONE CURRENT_SETTING('timezone'))
                  AND date < (($4::date + INTERVAL '1 day') AT TIME ZONE CURRENT_SETTING('timezone'))
                  AND ($4::date >= $2::date OR $2 IS NULL)
                  AND ($4::date <= $3::date OR $3 IS NULL)
                  AND status != 'REFUNDED'
            )
            SELECT
                (h.total_revenue + t.total_revenue) as total_revenue,
                (h.total_count + t.total_count) as total_count,
                (h.staff_revenue + t.staff_revenue) as staff_revenue,
                (h.staff_count + t.staff_count) as staff_count,
                (h.consumer_revenue + t.consumer_revenue) as consumer_revenue,
                (h.consumer_count + t.consumer_count) as consumer_count,
                (h.pos_n_revenue + t.pos_n_revenue) as pos_n_revenue,
                (h.pos_n_count + t.pos_n_count) as pos_n_count
            FROM historical h, today_realtime t
        `;

        const dailyQuery = `
            SELECT 
                TO_CHAR(sales_date, 'Dy')::TEXT as day_name,
                TO_CHAR(sales_date, 'YYYY-MM-DD')::TEXT as date,
                total_revenue::NUMERIC as sales
            FROM mv_branch_daily_sales
            WHERE (branch_id = $1 OR $1 IS NULL)
              AND (sales_date >= $2::date OR $2 IS NULL)
              AND (sales_date <= $3::date OR $3 IS NULL)
              AND sales_date < $4::date
            UNION ALL
            SELECT 
                TO_CHAR($4::date, 'Dy')::TEXT as day_name,
                TO_CHAR($4::date, 'YYYY-MM-DD')::TEXT as date,
                COALESCE(SUM(CASE WHEN order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END), 0)::NUMERIC as sales
            FROM transactions
            WHERE (branch_id = $1 OR $1 IS NULL)
              AND date >= ($4::date AT TIME ZONE CURRENT_SETTING('timezone'))
              AND date < (($4::date + INTERVAL '1 day') AT TIME ZONE CURRENT_SETTING('timezone'))
              AND ($4::date >= $2::date OR $2 IS NULL)
              AND ($4::date <= $3::date OR $3 IS NULL)
              AND status != 'REFUNDED'
            ORDER BY date ASC
        `;

        const topItemsQuery = `
            WITH combined AS (
                SELECT item_name::TEXT, total_quantity::BIGINT, total_revenue::NUMERIC
                FROM mv_item_sales_summary
                WHERE (branch_id = $1 OR $1 IS NULL)
                  AND (sales_date >= $2::date OR $2 IS NULL)
                  AND (sales_date <= $3::date OR $3 IS NULL)
                  AND sales_date < $4::date
                UNION ALL
                -- Today's items (not yet in the materialized view). Filter to today's
                -- transactions FIRST, then cap at 10000 rows (ARCH-H2) — capping before
                -- filtering returned an arbitrary slice that usually missed today entirely.
                SELECT (item->>'name')::TEXT as item_name, SUM((item->>'quantity')::int)::BIGINT as total_quantity, SUM(((item->>'price')::numeric * (item->>'quantity')::int))::NUMERIC as total_revenue
                FROM (
                    SELECT items FROM transactions
                    WHERE (branch_id = $1 OR $1 IS NULL)
                      AND date >= ($4::date AT TIME ZONE CURRENT_SETTING('timezone'))
                      AND date < (($4::date + INTERVAL '1 day') AT TIME ZONE CURRENT_SETTING('timezone'))
                      AND ($4::date >= $2::date OR $2 IS NULL)
                      AND ($4::date <= $3::date OR $3 IS NULL)
                      AND status = 'COMPLETED'
                    LIMIT 10000
                ) t_bounded,
                     LATERAL jsonb_array_elements(t_bounded.items) AS item
                WHERE item->>'name' NOT ILIKE '%Balance Settlement%'
                GROUP BY item->>'name'
            )
            SELECT item_name as name, SUM(total_quantity) as quantity, SUM(total_revenue) as revenue
            FROM combined
            GROUP BY item_name
            ORDER BY quantity DESC
            LIMIT 5
        `;

        const branchQuery = `
            WITH historical AS (
                SELECT branch_id, 
                       SUM(total_transactions) as total_count, 
                       SUM(total_revenue) as total_revenue,
                       SUM(staff_revenue) as staff_revenue,
                       SUM(consumer_revenue) as consumer_revenue,
                       SUM(pos_n_revenue) as pos_n_revenue
                FROM mv_branch_daily_sales
                WHERE (sales_date >= $2::date OR $2 IS NULL)
                  AND (sales_date <= $3::date OR $3 IS NULL)
                  AND (branch_id = $1 OR $1 IS NULL)
                  AND sales_date < $4::date
                GROUP BY branch_id
            ),
            today_realtime AS (
                SELECT branch_id,
                       COALESCE(COUNT(CASE WHEN order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN 1 END), 0) as total_count,
                       COALESCE(SUM(CASE WHEN order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END), 0) as total_revenue,
                       COALESCE(SUM(CASE WHEN staff_id IS NOT NULL AND staff_id NOT IN ('POS-N') AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END), 0) as staff_revenue,
                       COALESCE(SUM(CASE WHEN consumer_id IS NOT NULL AND order_source != 'SETTLEMENT' AND items::text NOT ILIKE '%Balance Settlement%' THEN total_amount ELSE 0 END), 0) as consumer_revenue,
                       COALESCE(SUM(CASE WHEN staff_id = 'POS-N' THEN total_amount ELSE 0 END), 0) as pos_n_revenue
                FROM transactions
                WHERE (branch_id = $1 OR $1 IS NULL)
                  AND date >= ($4::date AT TIME ZONE CURRENT_SETTING('timezone'))
                  AND date < (($4::date + INTERVAL '1 day') AT TIME ZONE CURRENT_SETTING('timezone'))
                  AND ($4::date >= $2::date OR $2 IS NULL)
                  AND ($4::date <= $3::date OR $3 IS NULL)
                  AND status != 'REFUNDED'
                GROUP BY branch_id
            )
            SELECT
                b.name as branch_name,
                b.id as branch_id,
                (COALESCE(h.total_count, 0) + COALESCE(t.total_count, 0)) as total_count,
                (COALESCE(h.total_revenue, 0) + COALESCE(t.total_revenue, 0)) as total_revenue,
                (COALESCE(h.staff_revenue, 0) + COALESCE(t.staff_revenue, 0)) as staff_revenue,
                (COALESCE(h.consumer_revenue, 0) + COALESCE(t.consumer_revenue, 0)) as consumer_revenue,
                (COALESCE(h.pos_n_revenue, 0) + COALESCE(t.pos_n_revenue, 0)) as pos_n_revenue
            FROM branches b
            LEFT JOIN historical h ON b.id = h.branch_id
            LEFT JOIN today_realtime t ON b.id = t.branch_id
            WHERE (b.id = $1 OR $1 IS NULL) AND b.is_active = true AND b.name != 'Main Branch'
            ORDER BY total_revenue DESC
        `;

        // Money-received view: consumer balance settlements are real cash/digital receipts, so they are
        // intentionally NOT excluded here (they are excluded from the sales/revenue figures above).
        const paymentDetailsQuery = `
            SELECT
                payment_method,
                COALESCE(SUM(total_amount), 0) as revenue,
                COUNT(*) as count
            FROM transactions
            WHERE (branch_id = $1 OR $1 IS NULL)
              AND date >= ($2::date AT TIME ZONE CURRENT_SETTING('timezone'))
              AND date < (($3::date + INTERVAL '1 day') AT TIME ZONE CURRENT_SETTING('timezone'))
              AND status != 'REFUNDED'
            GROUP BY payment_method
        `;

        const recentPaymentsQuery = `
            SELECT
                t.id,
                t.date,
                t.total_amount,
                t.payment_method,
                t.staff_id,
                t.consumer_id,
                t.order_source,
                t.items,
                b.name as branch_name
            FROM transactions t
            LEFT JOIN branches b ON t.branch_id = b.id
            WHERE (t.branch_id = $1 OR $1 IS NULL)
              AND (t.date >= ($2::date AT TIME ZONE CURRENT_SETTING('timezone')) OR $2 IS NULL)
              AND (t.date < (($3::date + INTERVAL '1 day') AT TIME ZONE CURRENT_SETTING('timezone')) OR $3 IS NULL)
              AND t.status != 'REFUNDED'
            ORDER BY t.date DESC
            LIMIT 10
        `;

        // Note: Dynamic counts (staff, menu) still use raw tables as they are small and real-time.
        const countsQuery = `
            SELECT
                (SELECT COUNT(*) FROM staff) as staff_count,
                (SELECT COUNT(*) FROM menu m JOIN branches b ON m.branch_id = b.id WHERE (m.branch_id = $1 OR $1 IS NULL) AND m.is_deleted = false AND b.is_active = true AND (b.name != 'Main Branch' OR $2::boolean = true)) as menu_count
        `;

        const [statsRes, dailyRes, topItemsRes, branchRes, paymentDetailsRes, countsRes, pmRes, recentPaymentsRes] = await Promise.all([
            query(statsQuery, [branchId, startDate, endDate, today]),
            query(dailyQuery, [branchId, startDate, endDate, today]),
            query(topItemsQuery, [branchId, startDate, endDate, today]),
            query(branchQuery, [branchId, startDate, endDate, today]),
            query(paymentDetailsQuery, [branchId, startDate, endDate]),
            pool.query(countsQuery, [branchId, isAdmin]),
            pool.query('SELECT id, name, type FROM payment_methods WHERE is_active = true').catch(e => {
                logger.error('Error reading payment methods for dashboard from DB', e);
                return { rows: [] };
            }),
            query(recentPaymentsQuery, [branchId, startDate, endDate])
        ]);

        const configuredMethods = pmRes.rows;

        const s = statsRes.rows[0];

        // Process dynamic payment breakdown
        const paymentMap = new Map();

        paymentDetailsRes.rows.forEach(row => {
            let rawLabel = (row.payment_method || 'Cash');
            let normalizedKey = rawLabel.toUpperCase();

            // Try to find a matching configured method from active settings
            const configured = configuredMethods.find(m =>
                m.id.toUpperCase() === normalizedKey ||
                m.name.toUpperCase() === normalizedKey
            );

            // Use configured name if found, otherwise use raw label with some defaults
            let name = rawLabel;
            let type = 'digital'; // Default type

            if (configured) {
                name = configured.name;
                type = configured.type;
            } else {
                // System fallbacks for methods not explicitly in payment_methods table
                if (normalizedKey === 'CREDIT') {
                    name = 'Credit (Internal)';
                    type = 'credit';
                } else if (normalizedKey === 'CASH') {
                    name = 'Cash';
                    type = 'cash';
                }
            }

            const revenue = parseFloat(row.revenue);
            const count = parseInt(row.count);

            if (paymentMap.has(name)) {
                const existing = paymentMap.get(name);
                existing.revenue += revenue;
                existing.count += count;
            } else {
                paymentMap.set(name, { name, type, revenue, count });
            }
        });

        const paymentBreakdown = Array.from(paymentMap.values())
            .filter(m => m.revenue > 0)
            .sort((a, b) => b.revenue - a.revenue);

        const responseData = {
            totalRevenue: parseFloat(s.total_revenue),
            totalCount: parseInt(s.total_count),
            staffCount: parseInt(countsRes.rows[0].staff_count),
            menuCount: parseInt(countsRes.rows[0].menu_count),
            paymentBreakdown,
            typeBreakdown: [
                { name: 'Staff', revenue: parseFloat(s.staff_revenue), count: parseInt(s.staff_count || 0) },
                { name: 'Consumer', revenue: parseFloat(s.consumer_revenue), count: parseInt(s.consumer_count || 0) },
                { name: 'POS-N', revenue: parseFloat(s.pos_n_revenue), count: parseInt(s.pos_n_count || 0) }
            ],
            salesChart: dailyRes.rows.map(r => ({ name: r.day_name, date: r.date, sales: parseFloat(r.sales) })),
            topItems: topItemsRes.rows.map(r => ({ name: r.name, quantity: parseInt(r.quantity), revenue: parseFloat(r.revenue) })),
            branchBreakdown: branchRes.rows.map(r => ({
                id: r.branch_id,
                name: r.branch_name || 'Unknown',
                revenue: parseFloat(r.total_revenue),
                count: parseInt(r.total_count),
                Staff: parseFloat(r.staff_revenue),
                Consumer: parseFloat(r.consumer_revenue),
                'POS-N': parseFloat(r.pos_n_revenue)
            })),
            recentPayments: recentPaymentsRes.rows.map(r => {
                let type = 'Staff';
                const isSettlement = r.order_source === 'SETTLEMENT' || (Array.isArray(r.items) && r.items.some(i => i.name && i.name.includes('Balance Settlement'))) || (typeof r.items === 'string' && r.items.includes('Balance Settlement'));
                if (isSettlement) type = 'Settlement';
                else if (r.staff_id === 'POS-N') type = 'POS-N';
                else if (r.consumer_id) type = 'Consumer';
                return {
                    id: r.id,
                    date: r.date,
                    amount: parseFloat(r.total_amount),
                    mop: r.payment_method || 'Cash',
                    type,
                    branch: r.branch_name || null
                };
            })
        };

        // ARCH-H2: Cache dashboard aggregate stats for 30 seconds.
        // Short TTL ensures real-time accuracy while still absorbing burst traffic on cache misses.
        await cacheSet(cacheKey, responseData, 30);

        res.json(responseData);
    } catch (err) {
        logger.error('Dashboard stats error', err);
        return next(err);
    }
};

module.exports = {
    getDashboardStats
};
