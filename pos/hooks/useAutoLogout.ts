import { useEffect, useRef, useCallback } from 'react';

interface UseAutoLogoutProps {
    onLogout: () => void;
    isActive: boolean; // Only run when user is logged in
    timeoutMs?: number; // Default 15 minutes (15 * 60 * 1000)
}

const DEFAULT_TIMEOUT = 15 * 60 * 1000; // 15 minutes

const THROTTLE_MS = 1000; // Only reset the inactivity timer once per second

export const useAutoLogout = ({ onLogout, isActive, timeoutMs = DEFAULT_TIMEOUT }: UseAutoLogoutProps) => {
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef<number>(0);
    const onLogoutRef = useRef(onLogout);
    useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

    const resetTimer = useCallback(() => {
        if (!isActive) return;

        // Throttle: ignore events fired within 1s of the last reset to avoid
        // hundreds of clearTimeout/setTimeout calls from mousemove/scroll.
        const now = Date.now();
        if (now - lastActivityRef.current < THROTTLE_MS) return;
        lastActivityRef.current = now;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            onLogoutRef.current();
        }, timeoutMs);
    }, [isActive, timeoutMs]); // onLogout accessed via ref — not a dep

    useEffect(() => {
        if (!isActive) {
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        const events = [
            'mousedown',
            'mousemove',
            'wheel',
            'keydown',
            'touchstart',
            'scroll',
            'click'
        ];

        resetTimer();

        events.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => window.removeEventListener(event, resetTimer));
        };
    }, [isActive, resetTimer]);
};
