/**
 * Environment Variable Validation Utility
 * Ensures all required environment variables are present at startup
 * Prevents runtime failures in production
 */

const { getSafeTimezone } = require('./timezone.cjs');
const logger = require('./logger.cjs');

/**
 * Required environment variables
 */
const REQUIRED_VARS = [
    'DB_PASSWORD',
    'JWT_SECRET',
    'REFRESH_TOKEN_SECRET',
    'DB_ENCRYPTION_SECRET',
    'TZ',
    'CORS_ORIGIN'
];

/**
 * Optional but recommended environment variables
 */
const RECOMMENDED_VARS = [
    'DB_USER',
    'DB_HOST',
    'DB_NAME',
    'DB_PORT',
    'PORT',
    'NODE_ENV',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_FROM'
];

/**
 * Validates that required environment variables are set
 * @throws {Error} If required variables are missing
 */
function validateRequiredEnvVars() {
    const missing = REQUIRED_VARS.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('╔════════════════════════════════════════════════════════════════╗');
        console.error('║                     FATAL ERROR                                ║');
        console.error('╚════════════════════════════════════════════════════════════════╝');
        console.error('');
        console.error(`Missing required environment variables: ${missing.join(', ')}`);
        console.error('');
        console.error('Please check your .env file and ensure all required variables are set.');
        console.error('See .env.example for reference.');
        console.error('');
        process.exit(1);
    }
}

/**
 * Validates environment variable values
 * @throws {Error} If validation fails
 */
function validateEnvVarValues() {
    const errors = [];

    // Validate JWT secrets are different
    if (process.env.JWT_SECRET === process.env.REFRESH_TOKEN_SECRET) {
        errors.push('JWT_SECRET and REFRESH_TOKEN_SECRET must be different for security');
    }

    // Validate JWT secrets are strong (at least 32 characters)
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters long');
    }

    if (process.env.REFRESH_TOKEN_SECRET && process.env.REFRESH_TOKEN_SECRET.length < 32) {
        errors.push('REFRESH_TOKEN_SECRET must be at least 32 characters long');
    }

    // Validate encryption secret is strong (at least 32 characters)
    if (process.env.DB_ENCRYPTION_SECRET && process.env.DB_ENCRYPTION_SECRET.length < 32) {
        errors.push('DB_ENCRYPTION_SECRET must be at least 32 characters long');
    }

    // Validate timezone
    try {
        getSafeTimezone();
    } catch (err) {
        errors.push(err.message);
    }

    // SEC-M1: Warn if DB_ENCRYPTION_SALT is missing or appears derived from the secret
    if (!process.env.DB_ENCRYPTION_SALT) {
        logger.warn('DB_ENCRYPTION_SALT is not set. If it is derived from DB_ENCRYPTION_SECRET, this weakens encryption security. Set a separate, independent salt value.');
    } else if (process.env.DB_ENCRYPTION_SECRET && process.env.DB_ENCRYPTION_SALT === process.env.DB_ENCRYPTION_SECRET) {
        logger.warn('DB_ENCRYPTION_SALT appears to be the same as DB_ENCRYPTION_SECRET. Use a separate, independent salt for better security.');
    }

    // SEC-M3: Warn if Redis has no password in production
    if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL && !process.env.REDIS_URL.includes('@')) {
        logger.warn('Redis has no password configured in production');
    }

    // Validate CORS origin
    if (process.env.CORS_ORIGIN) {
        const origins = process.env.CORS_ORIGIN.split(',');
        const hasWildcard = origins.includes('*');
        const isProduction = process.env.NODE_ENV === 'production';

        if (hasWildcard && isProduction) {
            errors.push('CORS_ORIGIN cannot contain wildcard (*) in production');
        }
    }

    // Validate PORT is a number
    if (process.env.PORT && isNaN(parseInt(process.env.PORT))) {
        errors.push('PORT must be a valid number');
    }

    // Validate DB_PORT is a number
    if (process.env.DB_PORT && isNaN(parseInt(process.env.DB_PORT))) {
        errors.push('DB_PORT must be a valid number');
    }

    if (errors.length > 0) {
        console.error('╔════════════════════════════════════════════════════════════════╗');
        console.error('║           ENVIRONMENT VALIDATION FAILED                        ║');
        console.error('╚════════════════════════════════════════════════════════════════╝');
        console.error('');
        errors.forEach(err => console.error(`  ✗ ${err}`));
        console.error('');
        process.exit(1);
    }
}

/**
 * Warns about missing recommended variables
 */
function warnMissingRecommended() {
    const missing = RECOMMENDED_VARS.filter(key => !process.env[key]);

    if (missing.length > 0) {
        logger.warn('Missing recommended environment variables:', missing.join(', '));
        logger.warn('Some features may not work correctly. See .env.example for reference.');
    }
}

/**
 * Validates all environment variables
 * Call this at application startup before any other initialization
 */
function validateEnvironment() {
    // SECURITY FIX: console.log is acceptable here - this runs before logger is initialized
    console.log('Validating environment variables...');

    validateRequiredEnvVars();
    validateEnvVarValues();
    warnMissingRecommended();

    console.log('✓ Environment validation passed');
}

module.exports = {
    validateEnvironment,
    validateRequiredEnvVars,
    validateEnvVarValues,
    REQUIRED_VARS,
    RECOMMENDED_VARS
};
