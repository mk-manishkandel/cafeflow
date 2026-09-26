/**
 * ReconnectBanner.tsx
 * Non-blocking warning shown when the realtime socket is down but the API is
 * still reachable. Sales keep working; only live updates are paused.
 * (Full-screen blocking is reserved for true API unreachability — see
 * OfflineBlocker + useConnectionStatus.)
 */
import React from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useSocket } from '../../contexts/SocketContext';
import useConnectionStatus from '../../hooks/useOnlineStatus';

export const ReconnectBanner: React.FC = () => {
  const { isConnected, hasEverConnected } = useSocket();
  const { canOperate } = useConnectionStatus();

  if (!canOperate || !hasEverConnected || isConnected) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[9000] flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-medium py-1.5 px-4 shadow-md"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Live updates paused — connection lost.</span>
      <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      <span>Reconnecting…</span>
    </div>
  );
};

export default ReconnectBanner;
