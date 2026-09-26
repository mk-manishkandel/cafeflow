import React, { useState, useRef, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
    children: React.ReactNode;
    onRefresh?: () => Promise<void>;
}

const PullToRefresh: React.FC<PullToRefreshProps> = React.memo(({ children, onRefresh }) => {
    // Default: reload the page if no onRefresh is provided
    const defaultRefresh = useCallback(() => {
        window.location.reload();
        return Promise.resolve();
    }, []);

    const handleRefresh = onRefresh || defaultRefresh;
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    // Performance Optimization: Use refs for distance to avoid React render cycles during pull
    const pullDistanceRef = useRef(0);
    const startY = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clean up pending animation timers on unmount
    useEffect(() => {
        return () => {
            if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
            if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
        };
    }, []);

    const threshold = 100;
    const maxPull = 130;

    // Helper to update elements directly (bypass React for 60fps)
    const updateStyles = useCallback((distance: number) => {
        if (!indicatorRef.current || !contentRef.current) return;

        const rotation = Math.min(distance * 3, 360);
        const opacity = Math.min(distance / 50, 1);

        // Use translate3d for GPU acceleration
        indicatorRef.current.style.transform = `translate3d(0, ${Math.min(distance, 80) - 60}px, 0)`;
        indicatorRef.current.style.opacity = opacity.toString();

        contentRef.current.style.transform = distance > 0 ? `translate3d(0, ${distance * 0.4}px, 0)` : 'none';

        // Update rotation of the icon if it exists
        const icon = indicatorRef.current.querySelector('.refresh-icon') as HTMLElement;
        if (icon && !isRefreshing) {
            icon.style.transform = `rotate(${rotation}deg)`;
        }
    }, [isRefreshing]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const scrollTop = containerRef.current?.scrollTop || 0;
        if (scrollTop === 0 && window.scrollY === 0 && !isRefreshing) {
            startY.current = e.touches[0].clientY;
            (e as any).startX = e.touches[0].clientX;
            pullDistanceRef.current = 0;
        }
    }, [isRefreshing]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (isRefreshing || isAnimating) return;

        const scrollTop = containerRef.current?.scrollTop || 0;
        if (scrollTop > 0 || window.scrollY > 0) return;

        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;

        const diffY = currentY - startY.current;
        const diffX = Math.abs(currentX - ((e as any).startX || 0));

        if (diffY <= 0) return;
        if (diffX > diffY * 0.8) return;
        if (startY.current === 0) return;

        const resistance = 1 - Math.min(diffY / 400, 0.7);
        const distance = Math.min(diffY * resistance, maxPull);

        pullDistanceRef.current = distance;
        updateStyles(distance);

        if (distance > 10 && e.cancelable) {
            e.preventDefault();
        }
    }, [isRefreshing, isAnimating, updateStyles]);

    const handleTouchEnd = useCallback(async () => {
        if (isRefreshing || isAnimating) return;

        const distance = pullDistanceRef.current;

        if (distance >= threshold) {
            setIsAnimating(true);
            setIsRefreshing(true);

            // Settle to refresh position
            pullDistanceRef.current = 50;
            updateStyles(50);

            try {
                await handleRefresh();
            } finally {
                settleTimeoutRef.current = setTimeout(() => {
                    pullDistanceRef.current = 0;
                    updateStyles(0);
                    resetTimeoutRef.current = setTimeout(() => {
                        setIsRefreshing(false);
                        setIsAnimating(false);
                    }, 300);
                }, 400);
            }
        } else if (distance > 0) {
            setIsAnimating(true);
            pullDistanceRef.current = 0;
            updateStyles(0);
            resetTimeoutRef.current = setTimeout(() => setIsAnimating(false), 300);
        }
    }, [handleRefresh, isRefreshing, isAnimating, updateStyles]);

    return (
        <div
            ref={containerRef}
            className="h-full overflow-y-auto relative bg-slate-50/50"
            style={{ overscrollBehavior: 'none' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                ref={indicatorRef}
                className="absolute left-0 right-0 top-0 flex justify-center pointer-events-none z-50 will-change-transform"
                style={{
                    transform: `translate3d(0, -60px, 0)`,
                    opacity: 0,
                    transition: isAnimating ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s' : 'none',
                }}
            >
                <div className={`
                    flex items-center gap-2 px-4 py-2 rounded-full shadow-lg
                    ${isRefreshing
                        ? 'bg-slate-900 text-white'
                        : pullDistanceRef.current > threshold
                            ? 'bg-indigo-600 text-white scale-110'
                            : 'bg-white text-slate-600 border border-slate-200'
                    }
                    transition-all duration-100
                `}>
                    <RefreshCw
                        className={`w-4 h-4 refresh-icon ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                    <span className="text-xs font-bold">
                        {isRefreshing ? 'Refreshing...' : 'Pull to Refresh'}
                    </span>
                </div>
            </div>

            <div
                ref={contentRef}
                className="min-h-full will-change-transform"
                style={{
                    transition: isAnimating ? 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
                }}
            >
                {children}
            </div>
        </div>
    );
});

export default PullToRefresh;

