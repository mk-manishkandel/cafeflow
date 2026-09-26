import { useState, useCallback, useRef } from 'react';
import { fetchCsrfToken, initSession } from '../services/api';

interface SessionState {
  sessionId: string | null;
  loading: boolean;
  error: string | null;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({ sessionId: null, loading: false, error: null });
  const initializedRef = useRef(false);

  const startSession = useCallback(async (branchId: string) => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setState({ sessionId: null, loading: true, error: null });
    try {
      await fetchCsrfToken();
      const sessionId = await initSession(branchId);
      setState({ sessionId, loading: false, error: null });
    } catch (err) {
      initializedRef.current = false;
      setState({ sessionId: null, loading: false, error: err instanceof Error ? err.message : 'Session error' });
    }
  }, []);

  const resetSession = useCallback(async (branchId: string) => {
    initializedRef.current = false;
    await startSession(branchId);
  }, [startSession]);

  return { ...state, startSession, resetSession };
}
