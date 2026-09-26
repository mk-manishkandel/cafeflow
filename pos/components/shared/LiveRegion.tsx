import React, { useEffect, useRef } from 'react';

type LiveRegionPriority = 'polite' | 'assertive' | 'off';

interface LiveRegionProps {
    message: string;
    priority?: LiveRegionPriority;
    atomic?: boolean;
    clearAfter?: number; // milliseconds
}

/**
 * Live Region Component
 * Announces updates to screen readers without moving focus
 *
 * @param message - The message to announce
 * @param priority - 'polite' (wait for pause) or 'assertive' (immediate)
 * @param atomic - Whether to read the entire region or just changes
 * @param clearAfter - Auto-clear message after X milliseconds
 */
export const LiveRegion: React.FC<LiveRegionProps> = ({
    message,
    priority = 'polite',
    atomic = true,
    clearAfter
}) => {
    const [displayMessage, setDisplayMessage] = React.useState(message);
    const timeoutRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        setDisplayMessage(message);

        if (clearAfter && message) {
            // Clear previous timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            // Set new timeout to clear message
            timeoutRef.current = setTimeout(() => {
                setDisplayMessage('');
            }, clearAfter);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [message, clearAfter]);

    if (!displayMessage) return null;

    return (
        <div
            className="sr-only"
            role="status"
            aria-live={priority}
            aria-atomic={atomic}
        >
            {displayMessage}
        </div>
    );
};
