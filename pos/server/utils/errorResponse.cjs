'use strict';

/**
 * Sends a standardised JSON error response.
 * In production, `details` is suppressed so that raw DB error text and stack traces
 * are never forwarded to the client.
 *
 * @param {import('express').Response} res
 * @param {number} status  - HTTP status code
 * @param {string} message - Safe, human-readable error message
 * @param {*} [details]    - Optional extra context (dev-only)
 */
function sendError(res, status, message, details = undefined) {
    const body = { error: message };
    if (details !== undefined && process.env.NODE_ENV !== 'production') {
        body.details = details;
    }
    return res.status(status).json(body);
}

module.exports = { sendError };
