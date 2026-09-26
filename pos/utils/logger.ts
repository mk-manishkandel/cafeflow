/**
 * Simple frontend logger to replace console.log/error in production.
 */

const isProduction = process.env.NODE_ENV === 'production';

export const logger = {
    info: (message: string, ...args: any[]) => {
        if (!isProduction) {
            console.log(`[INFO] ${message}`, ...args);
        }
    },
    warn: (message: string, ...args: any[]) => {
        if (!isProduction) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    },
    error: (message: string, ...args: any[]) => {
        if (!isProduction) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    },
    debug: (message: string, ...args: any[]) => {
        if (!isProduction) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }
};

export default logger;
