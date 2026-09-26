/**
 * Simple in-memory cache for API GET requests to improve "snappiness" during navigation.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const DEFAULT_TTL = 30000; // 30 seconds

export const getCachedData = <T>(key: string, ttl: number = DEFAULT_TTL): T | null => {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > ttl) {
        cache.delete(key);
        return null;
    }

    return entry.data;
};

export const setCachedData = <T>(key: string, data: T): void => {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
};

export const clearCache = (pattern?: string): void => {
    if (!pattern) {
        cache.clear();
        return;
    }

    for (const key of cache.keys()) {
        if (key.includes(pattern)) {
            cache.delete(key);
        }
    }
};
