/**
 * useOnlineStatus.ts
 * Determines whether the terminal may operate, based on ACTUAL API reachability
 * (heartbeat probe) and browser connectivity — NOT the realtime socket.
 *
 * Rationale: a WebSocket drop degrades live updates but does not make sales
 * impossible. Hard-blocking on socket state falsely froze terminals whose HTTP
 * path was perfectly healthy. The socket is surfaced separately (see
 * ReconnectBanner) as a non-blocking warning.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// /health is inert (no cookies rotated, no auth side effects) — the CSRF
// endpoint must NEVER be used as a heartbeat: calling it rotates nothing now,
// but it also issues tokens; polling state-changing auth surfaces from a
// connectivity probe invites exactly the class of bug this avoids.
const HEARTBEAT_URL = '/health';
const NORMAL_PROBE_MS = 15000;
const DEGRADED_PROBE_MS = 5000;
const PROBE_TIMEOUT_MS = 8000;
// Two consecutive network-level failures before declaring the API unreachable,
// so a single dropped packet never freezes a working terminal.
const FAILURES_TO_UNREACHABLE = 2;

export interface ConnectionStatus {
  /** True when the browser reports an active network interface. */
  browserOnline: boolean;
  /** True when the API answered a recent heartbeat probe. */
  apiReachable: boolean;
  /** Operating gate: both of the above. Drives the full-screen blocker. */
  canOperate: boolean;
  /** Force an immediate probe. */
  probeNow: () => void;
}

export const useConnectionStatus = (): ConnectionStatus => {
  const [browserOnline, setBrowserOnline] = useState<boolean>(() => navigator.onLine);
  const [apiReachable, setApiReachable] = useState<boolean>(true);

  const failuresRef = useRef(0);
  const probingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const probe = useCallback(async () => {
    if (!navigator.onLine || probingRef.current) return;
    probingRef.current = true;
    try {
      // Feature-detect AbortSignal.timeout — unsupported on older POS tablets
      // (Safari <16, Chrome <103) where it throws TypeError. Without the
      // fallback every probe "fails" and healthy terminals get walled behind
      // the offline blocker permanently.
      const signal = typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(PROBE_TIMEOUT_MS)
        : undefined;
      // Any HTTP response proves the network path to the app is alive —
      // even a non-2xx status means "not offline" for blocking purposes.
      await fetch(HEARTBEAT_URL, { cache: 'no-store', signal });
      if (failuresRef.current > 0) {
        failuresRef.current = 0;
        setApiReachable(true);
      } else if (!apiReachable) {
        setApiReachable(true);
      }
    } catch {
      failuresRef.current += 1;
      if (failuresRef.current >= FAILURES_TO_UNREACHABLE) {
        setApiReachable(false);
      }
    } finally {
      probingRef.current = false;
    }
  }, [apiReachable]);

  const probeNow = useCallback(() => {
    void probe();
  }, [probe]);

  // Recurring probe loop — faster cadence while degraded so recovery is snappy.
  useEffect(() => {
    let cancelled = false;

    const loop = () => {
      void probe().finally(() => {
        if (cancelled) return;
        const healthy = navigator.onLine && failuresRef.current === 0;
        timerRef.current = setTimeout(loop, healthy ? NORMAL_PROBE_MS : DEGRADED_PROBE_MS);
      });
    };

    loop();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [probe]);

  // React instantly to connectivity events instead of waiting for the next tick.
  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      void probe();
    };
    const handleOffline = () => {
      setBrowserOnline(false);
    };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void probe();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [probe]);

  return {
    browserOnline,
    apiReachable,
    canOperate: browserOnline && apiReachable,
    probeNow,
  };
};

export default useConnectionStatus;
