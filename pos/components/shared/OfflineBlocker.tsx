/**
 * OfflineBlocker.tsx
 * Hard-blocks the entire UI whenever connectivity is lost. A POS must never
 * accept orders it cannot persist, so offline state renders a full-screen,
 * pointer-events-capturing overlay until the connection is restored.
 */
import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import useConnectionStatus from '../../hooks/useOnlineStatus';

export const OfflineBlocker: React.FC = () => {
  const { canOperate } = useConnectionStatus();

  if (canOperate) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-slate-900/95 backdrop-blur-sm text-white px-6 text-center"
      role="alert"
      aria-live="assertive"
      aria-label="Application blocked: no connection"
    >
      <div className="rounded-full bg-red-500/15 p-8">
        <WifiOff className="w-16 h-16 text-red-400" aria-hidden="true" />
      </div>

      <div>
        <h1 className="text-2xl font-bold">No Connection</h1>
        <p className="mt-2 max-w-md text-slate-300">
          This terminal is offline. Ordering and checkout are blocked to prevent
          lost or duplicated sales until the connection is restored.
        </p>
      </div>

      <div className="flex items-center gap-2 text-slate-300" aria-hidden="true">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium animate-pulse">Reconnecting…</span>
      </div>
    </div>
  );
};

export default OfflineBlocker;
