/**
 * safeStorage.ts
 * Hardened localStorage wrappers. All access is wrapped so that:
 *  - Storage being unavailable (private mode, disabled, SSR) never throws.
 *  - Corrupt JSON never crashes the app — the typed fallback is returned.
 *  - Quota-exceeded writes are swallowed with a warning instead of throwing.
 */
import logger from './logger';

const storageAvailable = (): boolean => {
    try {
        return typeof window !== 'undefined' && !!window.localStorage;
    } catch {
        return false;
    }
};

/** Reads a key and JSON-parses it; returns `fallback` on any failure. */
export const getItem = <T>(key: string, fallback: T): T => {
    if (!storageAvailable()) return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw) as T;
    } catch (err) {
        logger.warn(`safeStorage: failed to read "${key}"`, err);
        return fallback;
    }
};

/** JSON-stringifies and writes a value; returns false instead of throwing on quota errors. */
export const setItem = <T>(key: string, value: T): boolean => {
    if (!storageAvailable()) return false;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (err) {
        // QuotaExceededError (or storage disabled) — non-fatal by design.
        logger.warn(`safeStorage: failed to persist "${key}"`, err);
        return false;
    }
};

/** Reads a plain (non-JSON) string key; returns `fallback` on any failure. */
export const getItemRaw = (key: string, fallback: string): string => {
    if (!storageAvailable()) return fallback;
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch (err) {
        logger.warn(`safeStorage: failed to read "${key}"`, err);
        return fallback;
    }
};

/** Writes a plain (non-JSON) string value; returns false instead of throwing on quota errors. */
export const setItemRaw = (key: string, value: string): boolean => {
    if (!storageAvailable()) return false;
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (err) {
        logger.warn(`safeStorage: failed to persist "${key}"`, err);
        return false;
    }
};

/** Removes a key; never throws. */
export const removeItem = (key: string): void => {
    if (!storageAvailable()) return;
    try {
        window.localStorage.removeItem(key);
    } catch (err) {
        logger.warn(`safeStorage: failed to remove "${key}"`, err);
    }
};
