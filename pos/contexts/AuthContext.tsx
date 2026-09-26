import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, AuthContextType } from '../types/auth';
import { setTokenRefreshedCallback } from '../services/authService';
import logger from '../utils/logger';

// SECURITY: Keep the CSRF token in a module-level variable instead of
// localStorage/sessionStorage. Web Storage is accessible to any same-origin JS
// (XSS), whereas a plain module variable is not reachable from outside this
// module's closure. CSRF tokens are ephemeral — they are fetched fresh on every
// new session, so no cross-tab persistence is needed or desired.
let _csrfTokenValue: string | null = null;
/** Read the in-memory CSRF token (for use in authenticatedFetch etc.). */
export const getCsrfToken = (): string | null => _csrfTokenValue;
const _setInMemoryCsrfToken = (token: string | null): void => { _csrfTokenValue = token; };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // SECURITY FIX: Never store sensitive data in localStorage (XSS vulnerability)
    // Authentication state comes from HttpOnly cookies verified by the server
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [authorizationChecked, setAuthorizationChecked] = useState(false);
    const [csrfToken, setCsrfToken] = useState<string | null>(null);
    const [needsSetup, setNeedsSetup] = useState(false);

    /** Centralised setter that keeps React state and the module-level variable in sync. */
    const updateCsrfToken = useCallback((token: string | null) => {
        _setInMemoryCsrfToken(token);
        setCsrfToken(token);
    }, []);

    // BUGFIX: authService's 403-recovery flow fetches a fresh CSRF token from
    // /auth/refresh and needs this callback to store it. Without registration
    // the refreshed token was discarded and every retry reused the stale one,
    // producing endless 403s after the server-side pair changed.
    useEffect(() => {
        setTokenRefreshedCallback(updateCsrfToken);
        return () => setTokenRefreshedCallback(null);
    }, [updateCsrfToken]);

    const login = useCallback((userData: User, token: string | null) => {
        // Session state maintained by HttpOnly cookies only
        setUser(userData);
        setIsAuthenticated(true);
        if (token) {
            _setInMemoryCsrfToken(token);
            setCsrfToken(token);
        }
        window.dispatchEvent(new Event('auth-change'));
    }, []);

    const logout = useCallback(async () => {
        // Use the in-memory token (avoids a round-trip to fetch a fresh one when
        // we already have it, and never touches Web Storage).
        const token = _csrfTokenValue;
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(token ? { 'x-csrf-token': token } : {}),
                },
            });
        } catch (e) {
            logger.error("Logout request failed", e);
        }
        // Clear both React state and the module-level variable
        _setInMemoryCsrfToken(null);
        setCsrfToken(null);
        setUser(null);
        setIsAuthenticated(false);
        window.location.href = '/';
    }, []);

    const checkAuth = useCallback(async (signal?: AbortSignal) => {
        // Each request gets its own 10s timeout so a slow chain doesn't abort early.
        // A reason is passed to abort() so Chrome does not log "aborted without reason".
        const timedFetch = async (url: string, options?: RequestInit) => {
            const ctrl = new AbortController();
            const timeoutId = setTimeout(
                () => ctrl.abort(new DOMException('Request timed out', 'AbortError')),
                10000
            );
            // Combine the outer cancellation signal with the per-request timeout signal
            const combinedSignal = signal
                ? AbortSignal.any([signal, ctrl.signal])
                : ctrl.signal;
            return fetch(url, {
                method: 'GET',
                credentials: 'include',
                ...options,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(options?.headers as Record<string, string> || {}),
                },
                signal: combinedSignal,
            }).finally(() => clearTimeout(timeoutId));
        };

        // Start setup-status check immediately — runs in parallel with auth chain
        const setupCtrl = new AbortController();
        const setupTimeout = setTimeout(
            () => setupCtrl.abort(new DOMException('Setup check timed out', 'AbortError')),
            5000
        );
        const combinedSetupSignal = signal
            ? AbortSignal.any([signal, setupCtrl.signal])
            : setupCtrl.signal;
        const setupPromise = fetch('/api/auth/setup-status', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            signal: combinedSetupSignal,
        }).finally(() => clearTimeout(setupTimeout));
        // Attach an immediate no-op rejection handler so Chrome never reports this
        // promise as "Uncaught" — the timeout can fire while the auth chain above is
        // still in-flight, which would reject setupPromise before the second try-catch
        // below has a chance to await it.  The real error handling is still below.
        setupPromise.catch(() => { /* handled in the try-catch below */ });

        try {
            let res = await timedFetch('/api/auth/verify');
            let userResolved = false;

            if (!res.ok) {
                // Try to refresh the access token using refresh token cookie
                const refreshRes = await timedFetch('/api/auth/refresh', { method: 'POST' });

                if (refreshRes.ok) {
                    const refreshData = await refreshRes.json();
                    if (refreshData.csrfToken) {
                        updateCsrfToken(refreshData.csrfToken);
                    }
                    if (refreshData.user) {
                        // Refresh returned user data — skip the redundant second /verify request
                        setUser(refreshData.user);
                        setIsAuthenticated(true);
                        userResolved = true;
                    } else {
                        // Fallback for older server versions: retry verify to get user data
                        res = await timedFetch('/api/auth/verify');
                    }
                }
            }

            if (!userResolved) {
                if (res.ok) {
                    const data = await res.json();
                    if (data.valid) {
                        setUser(data.user);
                        setIsAuthenticated(true);
                        if (data.csrfToken) updateCsrfToken(data.csrfToken);
                    } else {
                        setIsAuthenticated(false);
                        setUser(null);
                    }
                } else {
                    setIsAuthenticated(false);
                    setUser(null);
                }
            }
        } catch (e) {
            if ((e as Error).name !== 'AbortError') {
                logger.error("Auth check failed", e);
            }
            // On timeout, unmount, or network error: don't log out — keep whatever state we had.
        }

        // Await the setup-status result BEFORE setting authorizationChecked.
        // If we set authorizationChecked=true first, the app renders routes with
        // needsSetup=false, immediately navigates to /login, and by the time
        // needsSetup becomes true the user is already at /login which doesn't
        // redirect to /setup — so the wizard never appears on a fresh install.
        try {
            const res = await setupPromise;
            if (res.ok) {
                const data = await res.json();
                setNeedsSetup(data.needsSetup);
            }
        } catch (e) {
            if ((e as Error).name !== 'AbortError') {
                logger.error("Setup check failed", e);
            }
        }

        setAuthorizationChecked(true);
    }, [updateCsrfToken]);

    useEffect(() => {
        // Register the in-memory token updater with authService so that when
        // authenticatedFetch silently refreshes a token it can propagate it back
        // into both the module-level variable and React state — without touching
        // Web Storage.
        setTokenRefreshedCallback(updateCsrfToken);
    }, [updateCsrfToken]);

    useEffect(() => {
        const ctrl = new AbortController();
        // Pass the abort signal so all in-flight fetches are cancelled on unmount,
        // preventing state updates on unmounted components and stale-closure errors.
        checkAuth(ctrl.signal).catch((e: unknown) => {
            if ((e as Error)?.name !== 'AbortError') {
                logger.error('checkAuth unhandled error', e);
            }
        });
        return () => ctrl.abort(new DOMException('Component unmounted', 'AbortError'));
    }, [checkAuth]);

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated,
            authorizationChecked,
            csrfToken,
            needsSetup,
            login,
            logout,
            checkAuth
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
