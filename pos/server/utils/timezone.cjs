/**
 * Timezone validation utility.
 * Prevents SQL injection via timezone string interpolation by validating against
 * the IANA timezone database before any string is used in a SQL query.
 *
 * Timezone is read exclusively from the TZ environment variable (.env).
 * The default fallback is UTC — never a hardcoded region-specific timezone.
 */

// Build a Set of valid IANA timezone names for O(1) lookup
const VALID_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

/**
 * Returns the system timezone from TZ env var, after verifying it is a valid IANA timezone.
 * Throws a fatal error if TZ is missing or invalid.
 *
 * Validation strategy (two-stage):
 *   1. Fast-path: check the pre-built VALID_TIMEZONES Set (covers canonical names).
 *   2. Fallback: attempt Intl.DateTimeFormat construction, which also accepts IANA aliases
 *      (e.g. "Asia/Kathmandu") that Intl.supportedValuesOf() may not enumerate on all
 *      Node.js/ICU builds.
 * A value must pass at least one stage to be used in SQL string interpolation.
 *
 * @param {string} [tz] - Optional override. If omitted, reads from process.env.TZ.
 * @returns {string} - A safe, validated timezone string
 */
function getSafeTimezone(tz) {
    // ARCH-M8: Strip characters that could enable SQL injection before any validation.
    // Timezone strings must never contain quotes, semicolons, backslashes, or whitespace.
    const raw = tz || process.env.TZ;
    if (!raw) {
        throw new Error('FATAL: TZ environment variable is missing. Timezone must be explicitly set in .env');
    }

    const candidate = raw.replace(/['";\s\\]/g, '');
    if (!candidate) {
        throw new Error('FATAL: TZ environment variable is missing after sanitization. Timezone must be explicitly set in .env');
    }

    // Stage 1: O(1) Set lookup for canonical IANA names.
    if (VALID_TIMEZONES.has(candidate)) {
        return candidate;
    }

    // Stage 2: Some valid IANA aliases (e.g. "Asia/Kathmandu") are accepted by the ICU
    // formatter but not enumerated by Intl.supportedValuesOf(). Accept them here.
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate });
        return candidate;
    } catch (e) {
        throw new Error(`FATAL: Invalid or unsupported TZ environment variable: "${candidate}". Must be a valid IANA timezone name. Please check .env`);
    }
}

/**
 * Whitelist of table names allowed for partition maintenance.
 * Prevents SQL injection via dynamic table name construction.
 */
const PARTITION_TABLES = ['transactions', 'audit_logs'];

/**
 * Validates a table name against the partition whitelist.
 * @param {string} tableName
 * @returns {boolean}
 */
function isValidPartitionTable(tableName) {
    return PARTITION_TABLES.includes(tableName);
}

module.exports = { getSafeTimezone, isValidPartitionTable, PARTITION_TABLES };
