/**
 * H7: Print Job Sweeper
 *
 * print_jobs rows are inserted as PENDING by helpers.cjs (printKOTDirect) and
 * printController.cjs; if the process dies between INSERT and the print attempt,
 * or the printer was transiently unreachable at insert time, the row sits in
 * PENDING forever and the print is silently lost. This sweeper:
 *
 *   1. Finds PENDING jobs older than PRINT_SWEEP_MINUTES (default 5) with fewer
 *      than MAX_ATTEMPTS (3) recorded sweep attempts.
 *   2. Reprints them via the SAME mechanism helpers.cjs uses — printViaNetwork()
 *      from utils/networkPrinterUtils.cjs, with the printer resolved through the
 *      row's printer_id and the payload/template persisted in content JSONB.
 *   3. Increments attempts (content->_sweep_attempts) on every try and sets
 *      status='FAILED' with error_message once attempts are exhausted.
 *
 * NOTE ON ATTEMPTS TRACKING: print_jobs has no `attempts` column (adding one
 * would require a migration outside this change's scope), so the counter is kept
 * in `content->_sweep_attempts`. helpers.cjs now seeds it as 0 at insert time;
 * COALESCE handles legacy rows.
 *
 * Jobs whose content lacks a reprintable payload (e.g. legacy rows or rows from
 * printController.cjs that store raw transaction JSON instead of {data,...}) are
 * still attempt-counted and eventually marked FAILED with an explanatory message
 * rather than retried blindly with garbage output.
 *
 * Structure/gating mirrors jobs/partitionMaintenance.cjs: this module only exports
 * runPrintJobSweeper(); index.cjs schedules it with primary-instance gating.
 */

const { pool } = require('../config/db.cjs');
const logger = require('../utils/logger.cjs');
const { printViaNetwork } = require('../utils/networkPrinterUtils.cjs');

const MAX_ATTEMPTS = 3;
const SWEEP_BATCH_LIMIT = 20;

const getStaleMinutes = () => {
    const n = parseInt(process.env.PRINT_SWEEP_MINUTES, 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
};

const runPrintJobSweeper = async () => {
    // Graceful-shutdown guard: index.cjs stops cron tasks first, but a tick may
    // already be in-flight when pool.end() runs — bail out instead of erroring.
    if (global.__shuttingDown) return;
    const staleMinutes = getStaleMinutes();
    let candidates;
    try {
        candidates = await pool.query(
            `SELECT j.id, j.branch_id, j.service_type, j.content,
                    p.ip_address, p.port, p.printer_type
             FROM print_jobs j
             LEFT JOIN printers p ON p.id = j.printer_id AND p.is_active = true
             WHERE j.status = 'PENDING'
               AND j.created_at < NOW() - ($1 || ' minutes')::interval
               AND COALESCE((j.content->>'_sweep_attempts')::int, 0) < $2
             ORDER BY j.created_at ASC
             LIMIT $3`,
            [String(staleMinutes), MAX_ATTEMPTS, SWEEP_BATCH_LIMIT]
        );
    } catch (err) {
        logger.error('PrintJobSweeper: failed to query stuck PENDING jobs', { message: err.message });
        return;
    }

    for (const job of candidates.rows) {
        const jobId = job.id;
        const prevAttempts = parseInt(job.content?._sweep_attempts, 10) || 0;
        const attempts = prevAttempts + 1;

        // Persist the attempt count first so a crash mid-retry can't loop forever
        // on the same row.
        try {
            await pool.query(
                `UPDATE print_jobs
                 SET content = jsonb_set(COALESCE(content, '{}'::jsonb), '{_sweep_attempts}', $1::text::jsonb, true),
                     updated_at = NOW()
                 WHERE id = $2`,
                [JSON.stringify(attempts), jobId]
            );
        } catch (err) {
            logger.error(`PrintJobSweeper: failed to bump attempts for job ${jobId}`, { message: err.message });
            continue;
        }

        const payload = job.content?.data;
        const templateHtml = job.content?.templateHtml || null;

        if (!job.ip_address || !payload) {
            // No printer configured or no persisted payload to reprint from.
            if (attempts >= MAX_ATTEMPTS) {
                await markFailed(jobId, 'Sweeper abandoned job: ' +
                    (!job.ip_address ? 'no active printer resolved' : 'no reprintable payload in content'));
            }
            continue;
        }

        try {
            await printViaNetwork(
                { ip_address: job.ip_address, port: job.port || 9100, printer_type: job.printer_type || 'THERMAL_80MM' },
                payload,
                job.service_type || 'KOT',
                templateHtml
            );
            await pool.query(
                "UPDATE print_jobs SET status = 'PRINTED', updated_at = NOW() WHERE id = $1",
                [jobId]
            );
            logger.info(`PrintJobSweeper: reprinted stuck job ${jobId} (${job.service_type}) after ${attempts} attempt(s)`);
        } catch (err) {
            if (attempts >= MAX_ATTEMPTS) {
                await markFailed(jobId, err.message);
                logger.warn(`PrintJobSweeper: job ${jobId} permanently FAILED after ${attempts} attempts: ${err.message}`);
            } else {
                await pool.query(
                    "UPDATE print_jobs SET error_message = $1, updated_at = NOW() WHERE id = $2",
                    [err.message, jobId]
                ).catch(e => logger.error(`PrintJobSweeper: failed to record retry error for ${jobId}`, { message: e.message }));
                logger.warn(`PrintJobSweeper: retry ${attempts}/${MAX_ATTEMPTS} failed for job ${jobId}: ${err.message}`);
            }
        }
    }
};

const markFailed = async (jobId, errorMessage) => {
    try {
        await pool.query(
            "UPDATE print_jobs SET status = 'FAILED', error_message = $1, updated_at = NOW() WHERE id = $2",
            [errorMessage, jobId]
        );
    } catch (err) {
        logger.error(`PrintJobSweeper: failed to mark job ${jobId} FAILED`, { message: err.message });
    }
};

module.exports = { runPrintJobSweeper };
