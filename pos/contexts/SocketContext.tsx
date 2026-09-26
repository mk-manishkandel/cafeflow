/**
 * SocketContext.tsx
 * Provides WebSocket connection management for real-time updates across the application.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    hasEverConnected: boolean;
    // Incremented each time a 'connect' event fires after a previous disconnect.
    // Consumers can react to reconnections to refetch data missed during outages.
    reconnectCount: number;
    lastEvent: { type: string; data: unknown } | null;
    joinBranch: (branchId: string) => void;
    joinUserRoom: (userId: string) => void;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
    hasEverConnected: false,
    reconnectCount: 0,
    lastEvent: null,
    joinBranch: () => { },
    joinUserRoom: () => { },
});

export const useSocket = () => useContext(SocketContext);

interface SocketProviderProps {
    children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    // Latches on first successful handshake so consumers can distinguish
    // "initial mount, not yet connected" from "connection lost".
    const [hasEverConnected, setHasEverConnected] = useState(false);
    // Latches that a disconnect happened so the next 'connect' is a true
    // reconnection (not the initial handshake) and bumps reconnectCount.
    const [reconnectCount, setReconnectCount] = useState(0);
    const hasDisconnectedRef = useRef(false);
    const [lastEvent, setLastEvent] = useState<{ type: string; data: unknown } | null>(null);

    useEffect(() => {
        // Connect to the same host as the API
        const socketInstance = io(window.location.origin, {
            reconnection: true,
            // Keep retrying forever — an abandoned reconnect would permanently
            // trip the OfflineBlocker even after connectivity returns.
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
            transports: ['websocket'],
        });

        socketInstance.on('connect', () => {
            setIsConnected(true);
            setHasEverConnected(true);
            if (hasDisconnectedRef.current) {
                hasDisconnectedRef.current = false;
                setReconnectCount((c) => c + 1);
            }
        });

        socketInstance.on('disconnect', (_reason) => {
            hasDisconnectedRef.current = true;
            setIsConnected(false);
        });

        socketInstance.on('connect_error', (_error) => {
            // connection error
        });

        // Listen for generic data update events
        socketInstance.on('data:updated', (data) => {
            setLastEvent({ type: 'data:updated', data });
        });

        // Listen for specific events
        socketInstance.on('transaction:created', (data) => {
            setLastEvent({ type: 'transaction:created', data });
        });

        socketInstance.on('transaction:refunded', (data) => {
            setLastEvent({ type: 'transaction:refunded', data });
        });

        socketInstance.on('transaction:deleted', (data) => {
            setLastEvent({ type: 'transaction:deleted', data });
        });

        socketInstance.on('consumer:updated', (data) => {
            setLastEvent({ type: 'consumer:updated', data });
        });

        socketInstance.on('menu:updated', (data) => {
            setLastEvent({ type: 'menu:updated', data });
        });

        socketInstance.on('student-order:updated', (data) => {
            setLastEvent({ type: 'student-order:updated', data });
        });

        socketInstance.on('user:force-logout', (data) => {
            setLastEvent({ type: 'user:force-logout', data });
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    const joinBranch = useCallback((branchId: string) => {
        if (socket && branchId) {
            socket.emit('join:branch', branchId);
        }
    }, [socket]);

    const joinUserRoom = useCallback((userId: string) => {
        if (socket && userId) {
            socket.emit('join:user', userId);
        }
    }, [socket]);

    return (
        <SocketContext.Provider value={{ socket, isConnected, hasEverConnected, reconnectCount, lastEvent, joinBranch, joinUserRoom }}>
            {children}
        </SocketContext.Provider>
    );
};

export default SocketContext;
