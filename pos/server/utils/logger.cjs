const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// ARCH-L4: Use mkdirSync with { recursive: true } — eliminates TOCTOU race between
// existsSync check and mkdirSync call (safe on all Node.js versions ≥ 10.12).
const logDir = path.join(__dirname, '../logs');
fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});

// ARCH-M5: Use structured JSON format in production for log aggregation tools
// (e.g. Loki, Elasticsearch, CloudWatch). Human-readable format kept for development.
const productionFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json()
);

const developmentFormat = combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    devFormat
);

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL,
    format: isProduction ? productionFormat : developmentFormat,
    transports: [
        // Daily Rotate File for errors
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '90d', // Compliance: 90-day retention (PCI-DSS, GDPR, SOC 2)
            zippedArchive: true,
            maxSize: '20m' // Rotate if file exceeds 20MB
        }),
        // Daily Rotate File for all logs
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '90d', // Compliance: 90-day retention
            zippedArchive: true,
            maxSize: '20m' // Rotate if file exceeds 20MB
        })
    ]
});

// If not in production, also log to console with colors
if (!isProduction) {
    logger.add(new winston.transports.Console({
        format: developmentFormat
    }));
}

// Degradation-path fix: when a file transport errors (e.g. disk full, EACCES,
// rotation failure), Winston re-emits the error on the logger. With no 'error'
// listener this surfaces as an uncaught exception and kills the process — and on
// a full disk the restart loop crashes again immediately. Swallow transport
// errors here; console transports still emit, and PM2 captures stdout/stderr.
logger.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[logger] transport error suppressed:', err?.message || err);
});

module.exports = logger;
