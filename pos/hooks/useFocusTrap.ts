import { useEffect, useRef } from 'react';

/**
 * Hook to trap focus within a modal or dialog
 * Ensures keyboard navigation stays within the component
 *
 * @param isActive - Whether the focus trap is currently active
 * @returns ref - Attach this to the container element
 */
export function useFocusTrap(isActive: boolean) {
    const containerRef = useRef<HTMLElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isActive) return;

        // Store the element that was focused before the modal opened
        previousActiveElement.current = document.activeElement as HTMLElement;

        const container = containerRef.current;
        if (!container) return;

        // Get all focusable elements
        const getFocusableElements = (): HTMLElement[] => {
            const selector = [
                'a[href]',
                'button:not([disabled])',
                'input:not([disabled])',
                'textarea:not([disabled])',
                'select:not([disabled])',
                '[tabindex]:not([tabindex="-1"])',
            ].join(', ');

            return Array.from(container.querySelectorAll(selector));
        };

        // Focus first element when modal opens
        const focusableElements = getFocusableElements();
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }

        const handleTabKey = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            const focusableElements = getFocusableElements();
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            // Shift + Tab (backwards)
            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } else {
                // Tab (forwards)
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        };

        container.addEventListener('keydown', handleTabKey);

        return () => {
            container.removeEventListener('keydown', handleTabKey);

            // Restore focus to previously focused element
            if (previousActiveElement.current) {
                previousActiveElement.current.focus();
            }
        };
    }, [isActive]);

    return containerRef;
}
