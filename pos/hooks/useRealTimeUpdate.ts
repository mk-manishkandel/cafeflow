/**
 * useRealTimeUpdate.ts
 * Custom hook for subscribing to real-time updates via WebSocket.
 * Components can use this hook to automatically refresh data when relevant events occur.
 */
import { useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';

type DataType = 'transaction' | 'consumer' | 'menu' | 'staff' | 'role' | 'user' | 'branch' | 'audit' | 'payment_method' | 'all';

interface UseRealTimeUpdateOptions {
    onUpdate: () => void;
    dataTypes: DataType[];
    branchId?: string | null;
    debounceMs?: number;
}

export const useRealTimeUpdate = ({
    onUpdate,
    dataTypes,
    branchId,
    debounceMs = 1000,
}: UseRealTimeUpdateOptions) => {
    const { lastEvent, joinBranch, isConnected, reconnectCount } = useSocket();
    const lastUpdateRef = useRef<number>(0);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Keep a ref to the latest onUpdate so the effect never needs it as a dep.
    // This prevents cascading re-runs when the caller re-creates the callback.
    const onUpdateRef = useRef(onUpdate);
    useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
    // Keep a ref to the latest dataTypes so inline arrays from callers don't
    // cause the main effect to re-run with stale lastEvent on every render.
    const dataTypesRef = useRef(dataTypes);
    useEffect(() => { dataTypesRef.current = dataTypes; }, [dataTypes]);

    // Join branch room when branchId changes
    useEffect(() => {
        if (branchId && isConnected) {
            joinBranch(branchId);
        }
    }, [branchId, isConnected, joinBranch]);

    // Refetch after a socket reconnection: events emitted during the outage are
    // lost forever, so wired views must refresh once connectivity returns.
    useEffect(() => {
        if (reconnectCount <= 0) return;

        const trigger = () => {
            const now = Date.now();
            if (now - lastUpdateRef.current < debounceMs) {
                // Schedule an update after debounce period if one isn't already scheduled
                if (!timeoutRef.current) {
                    timeoutRef.current = setTimeout(() => {
                        timeoutRef.current = null;
                        lastUpdateRef.current = Date.now();
                        onUpdateRef.current();
                    }, debounceMs);
                }
                return;
            }
            lastUpdateRef.current = now;
            onUpdateRef.current();
        };

        trigger();
    }, [reconnectCount, debounceMs]);

    // React to lastEvent changes only — dataTypes and onUpdate are accessed via refs
    // so callers can pass inline arrays/callbacks without triggering spurious re-runs.
    useEffect(() => {
        if (!lastEvent) return;

        const eventTypeStr = lastEvent.type; // e.g., 'menu:updated', 'data:updated'
        const baseType = eventTypeStr.split(':')[0] as DataType; // e.g., 'menu', 'data'
        const eventData = lastEvent.data as { type?: string } | undefined;
        const payloadType = eventData?.type as DataType | undefined; // e.g., 'menu' if generic data:updated

        const dt = dataTypesRef.current;
        // Check if this event is relevant to our subscribed data types
        const isRelevant =
            dt.includes('all') ||
            dt.includes(baseType) ||
            (payloadType && dt.includes(payloadType));

        if (!isRelevant) return;

        // Debounce updates to prevent rapid re-fetching
        const now = Date.now();
        if (now - lastUpdateRef.current < debounceMs) {
            // Schedule an update after debounce period if one isn't already scheduled
            if (!timeoutRef.current) {
                timeoutRef.current = setTimeout(() => {
                    timeoutRef.current = null;
                    lastUpdateRef.current = Date.now();
                    onUpdateRef.current();
                }, debounceMs);
            }
            return;
        }

        lastUpdateRef.current = now;
        onUpdateRef.current();
    }, [lastEvent, debounceMs]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);
};

export default useRealTimeUpdate;
