import { useEffect, useRef } from 'react';

/**
 * Custom hook to restore focus to the previously active element when a component unmounts
 * or when a specific condition (like isOpen) becomes false.
 * 
 * @param shouldRestore - If true, the hook will capture the current focus
 *                        and restore it when the component unmounts or shouldRestore becomes false.
 */
export const useFocusRestore = (shouldRestore: boolean) => {
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (shouldRestore) {
            // Capture currently focused element when shouldRestore becomes true
            previousFocusRef.current = document.activeElement as HTMLElement;
        }

        return () => {
            // Restore focus when the component unmounts or shouldRestore becomes false
            if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
                // Use requestAnimationFrame to ensure the focus is restored after the DOM updates
                requestAnimationFrame(() => {
                    previousFocusRef.current?.focus();
                });
            }
        };
    }, [shouldRestore]);
};
