import { useState, useMemo, useCallback, useEffect } from 'react';

interface UseEntityManagerOptions<T> {
    data: T[];
    initialSortKey?: keyof T | null;
    initialSortDir?: 'asc' | 'desc';
    itemsPerPage?: number;
    filterFn?: (item: T, query: string) => boolean;
    sortFn?: (a: T, b: T, key: keyof T, dir: 'asc' | 'desc') => number;
}

export function useEntityManager<T>({
    data,
    initialSortKey = null,
    initialSortDir = 'asc',
    itemsPerPage = 15,
    filterFn,
    sortFn
}: UseEntityManagerOptions<T>) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isShowingAll, setIsShowingAll] = useState(false);
    const [sortKey, setSortKey] = useState<keyof T | string | null>(initialSortKey as any);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);

    // Reset to page 1 when search or filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, sortKey, sortDir]);

    const filteredData = useMemo(() => {
        if (!filterFn) return data;
        // Run filterFn even if query is empty, as it might handle other filters (like tabs/status)
        return data.filter(item => filterFn(item, searchQuery.trim().toLowerCase()));
    }, [data, searchQuery, filterFn]);

    const sortedData = useMemo(() => {
        if (!sortKey) return filteredData;

        return [...filteredData].sort((a, b) => {
            if (sortFn) return sortFn(a, b, sortKey as keyof T, sortDir);

            const aVal = a[sortKey as keyof T];
            const bVal = b[sortKey as keyof T];

            if (aVal === bVal) return 0;

            // Handle null/undefined - always push to bottom if sortDir is 'asc', top if 'desc'? 
            // Better UX: invalid/empty values usually go to bottom regardless or consistent.
            // Let's standard: null/undefined checks first.
            if (aVal === null || aVal === undefined) return 1; // Always push nulls to end
            if (bVal === null || bVal === undefined) return -1;

            // Numeric Sort
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // String Sort
            const comparison = String(aVal).toLowerCase().localeCompare(String(bVal).toLowerCase(), undefined, { numeric: true });
            return sortDir === 'asc' ? comparison : -comparison;
        });
    }, [filteredData, sortKey, sortDir, sortFn]);

    const paginatedData = useMemo(() => {
        if (isShowingAll) return sortedData;
        const startIndex = (currentPage - 1) * itemsPerPage;
        return sortedData.slice(startIndex, startIndex + itemsPerPage);
    }, [sortedData, currentPage, itemsPerPage, isShowingAll]);

    const totalPages = Math.ceil(sortedData.length / itemsPerPage);

    const handleSort = useCallback((key: keyof T | string) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key as any);
            setSortDir('asc');
        }
    }, [sortKey]);

    const handleShowAll = useCallback(() => {
        setIsShowingAll(prev => !prev);
    }, []);

    return {
        searchQuery,
        setSearchQuery,
        currentPage,
        setCurrentPage,
        isShowingAll,
        handleShowAll,
        sortKey,
        sortDir,
        handleSort,
        filteredData,
        sortedData,
        paginatedData,
        totalPages,
        totalItems: sortedData.length,
        itemsPerPage
    };
}
