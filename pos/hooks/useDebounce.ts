import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce dynamic values (like search inputs).
 * @param value The value to debounce.
 * @param delay The delay in milliseconds.
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}
