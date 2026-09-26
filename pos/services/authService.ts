// In production, we serve frontend from the same origin, so relative path works best.
// This handles any port or domain changes automatically.
export const API_BASE = '/api';
import logger from '../utils/logger';
// SECURITY: CSRF token is held in an in-memory module variable (AuthContext).
// It is never written to Web Storage — both localStorage and sessionStorage are
// accessible to any same-origin XSS payload and are therefore unsuitable.
import { getCsrfToken } from '../contexts/AuthContext';

// Shared promise for coordinate concurrent token refreshes
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Module-level setter injected by AuthContext after a successful token refresh.
// This keeps authService decoupled from the React context tree while still
// allowing it to update the shared in-memory token.
let _onTokenRefreshed: ((token: string) => void) | null = null;
export const setTokenRefreshedCallback = (cb: ((token: string) => void) | null): void => { _onTokenRefreshed = cb; };

/**
 * Enhanced fetch that automatically includes cookies and handles token refresh.
 */
export const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    // Read the CSRF token from the in-memory module variable (never Web Storage)
    const csrfToken = getCsrfToken();

    const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...((options.headers as Record<string, string>) || {})
    };

    // Only set Content-Type to application/json if not already set and body is not FormData
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const fetchOptions: RequestInit = {
        ...options,
        credentials: 'include',
        headers
    };

    let response = await fetch(url, fetchOptions);

    if (response.status === 429) {
        // Anti-flap / Rate-limit recovery: Delay 1s and retry once
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = await fetch(url, fetchOptions);
    }

    if (response.status === 403 || response.status === 401) {
        if (!isRefreshing) {
            isRefreshing = true;
            refreshPromise = (async () => {
                try {
                    // Update: Use POST for refresh (CSRF check is bypassed for /refresh)
                    const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                    });

                    if (refreshResponse.ok) {
                        const data = await refreshResponse.json();
                        if (data.csrfToken && _onTokenRefreshed) {
                            // Propagate the refreshed token back to the in-memory store
                            _onTokenRefreshed(data.csrfToken);
                        }
                        return true;
                    }
                    return false;
                } catch (err) {
                    logger.error('Token refresh execution failed', err);
                    return false;
                } finally {
                    // Always drain the queue and reset state, even if the refresh threw
                    isRefreshing = false;
                    refreshPromise = null;
                }
            })();
        }

        const refreshSucceeded = await refreshPromise;

        if (refreshSucceeded) {
            // Re-read the updated CSRF token from the in-memory store
            const newCsrfToken = getCsrfToken();
            if (newCsrfToken) {
                headers['X-CSRF-Token'] = newCsrfToken;
            }
            response = await fetch(url, fetchOptions);
        }
    }

    return response;
};
