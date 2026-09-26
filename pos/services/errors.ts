/**
 * Typed error for API failures. `status` carries the HTTP status code when the
 * server responded (undefined for network failures), so callers can distinguish
 * "request failed" from "legitimately empty result".
 */
export class ApiError extends Error {
    constructor(message: string, public status?: number) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * True when an error is a fetch AbortError (request cancelled by the caller,
 * e.g. effect cleanup). Aborts must never be surfaced as failures.
 */
export const isAbortError = (err: unknown): boolean => (
    err instanceof DOMException && err.name === 'AbortError' ||
    err instanceof Error && err.name === 'AbortError'
);
