/**
 * apiNormalize.ts
 * Defensive extraction of list payloads from API responses whose envelope shape
 * has drifted over time (bare array, { data: [] }, { data: { data: [] } },
 * { items: [] }, paginated wrappers, etc.). Every consumer that reads a list
 * out of a service call should funnel through `normalizeList` so an unexpected
 * envelope degrades to an empty array instead of a white screen.
 */

const getValueAtPath = (payload: unknown, path: string): unknown => {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[key];
        }
        return undefined;
    }, payload);
};

/**
 * Extracts a list from a response payload, trying common envelope shapes.
 *
 * @param payload The raw resolved value from a service/API call.
 * @param paths   Optional caller-supplied paths tried FIRST (e.g. 'data.items',
 *                'result.rows') before the built-in defaults.
 * @returns Always an array — empty when nothing list-shaped is found.
 */
export const normalizeList = <T>(payload: unknown, ...paths: string[]): T[] => {
    if (Array.isArray(payload)) return payload as T[];
    if (!payload || typeof payload !== 'object') return [];

    const candidates = [
        ...paths,
        'data',
        'data.data',
        'items',
        'results',
        'rows',
    ];

    for (const path of candidates) {
        const value = getValueAtPath(payload, path);
        if (Array.isArray(value)) return value as T[];
    }

    return [];
};

/**
 * Extracts a pagination metadata object from a response payload if present.
 * Complements normalizeList for paginated envelopes ({ data, pagination }).
 */
export const normalizePagination = (
    payload: unknown
): { total?: number; totalPages?: number; page?: number } | null => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const pagination = (payload as Record<string, unknown>).pagination;
    if (pagination && typeof pagination === 'object' && !Array.isArray(pagination)) {
        return pagination as { total?: number; totalPages?: number; page?: number };
    }
    return null;
};
