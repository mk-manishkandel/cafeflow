/**
 * Issue 3 (HIGH): Partition Maintenance Job
 *
 * Creates the next 3 months of partitions for the three partitioned tables
 * (transactions, audit_logs) if they don't already exist.
 *
 * This function is the canonical implementation — index.cjs imports and
 * schedules it at startup (immediate run) and via the daily 03:00 cron.
 * The monthly scheduling guard at the call site ensures it runs on the 1st.
 */

const { pool } = require('../config/db.cjs');
const { isValidPartitionTable, PARTITION_TABLES } = require('../utils/timezone.cjs');
const logger = require('../utils/logger.cjs');

/**
 * Ensures partition tables exist for the current month and the next 2 months.
 * Uses `CREATE TABLE IF NOT EXISTS ... PARTITION OF ... FOR VALUES FROM (...) TO (...)`
 * so it is fully idempotent and safe to call repeatedly.
 *
 * @returns {Promise<void>}
 */
const runPartitionMaintenance = async () => {
    try {
        logger.info('Partition Maintenance: starting...');
        const targetMonths = 2; // current + next 2

        for (let i = 0; i <= targetMonths; i++) {
            const date = new Date();
            date.setDate(1); // normalise to 1st to avoid month-end edge cases
            date.setMonth(date.getMonth() + i);

            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');

            // Validate components (defense-in-depth)
            if (!/^\d{4}$/.test(String(year)) || !/^\d{2}$/.test(month)) {
                logger.error(`Partition Maintenance: invalid date components year=${year} month=${month}`);
                continue;
            }

            const nextDate = new Date(date);
            nextDate.setMonth(nextDate.getMonth() + 1);
            const nextYear = nextDate.getFullYear();
            const nextMonth = (nextDate.getMonth() + 1).toString().padStart(2, '0');

            const suffix    = `${year}_${month}`;
            const startDate = `${year}-${month}-01`;
            const endDate   = `${nextYear}-${nextMonth}-01`;

            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
                logger.error(`Partition Maintenance: unexpected date format start=${startDate} end=${endDate}`);
                continue;
            }

            for (const baseTable of PARTITION_TABLES) {
                if (!isValidPartitionTable(baseTable)) continue;

                const partitionName = `${baseTable}_${suffix}`;

                if (!/^[a-z_]+_\d{4}_\d{2}$/.test(partitionName)) {
                    logger.error(`Partition Maintenance: invalid partition name: ${partitionName}`);
                    continue;
                }

                // PostgreSQL does not support parameterised identifiers for table DDL
                await pool.query(
                    `CREATE TABLE IF NOT EXISTS ${partitionName}
                     PARTITION OF ${baseTable}
                     FOR VALUES FROM ('${startDate}') TO ('${endDate}')`
                );

                // Ensure trigram search indexes exist on audit_logs partitions
                if (baseTable === 'audit_logs') {
                    await pool.query(
                        `CREATE INDEX IF NOT EXISTS ${partitionName}_user_name_trgm
                         ON ${partitionName} USING GIN (user_name gin_trgm_ops)`
                    );
                    await pool.query(
                        `CREATE INDEX IF NOT EXISTS ${partitionName}_action_trgm
                         ON ${partitionName} USING GIN (action gin_trgm_ops)`
                    );
                }
            }
        }

        logger.info('Partition Maintenance: next partitions verified/created.');
    } catch (err) {
        logger.error('Partition Maintenance failed', { message: err.message, stack: err.stack });
    }
};

module.exports = { runPartitionMaintenance };
