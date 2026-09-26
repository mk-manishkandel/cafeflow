import { RefreshCw, Download, Loader2, X } from 'lucide-react';
import ReactDOM from 'react-dom';
import { useEffect, useState, useCallback } from 'react';
import { APP_VERSION } from '../constants/version';
import { Z_INDEX } from '../constants/zIndex';
import logger from '../utils/logger';

const VERSION_KEY = 'bicpos_app_version';
const UPDATE_DISMISSED_KEY = 'bicpos_update_dismissed';

const PWAUpdater = () => {
    const [showUpdateBanner, setShowUpdateBanner] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    // Version Sync & Check (works on all platforms: web, PWA, desktop)
    useEffect(() => {
        const checkVersion = async () => {
            // 1. Skip version check if in development mode
            if (import.meta.env.DEV) return;

            // 2. Check if update was already dismissed this session
            const dismissed = sessionStorage.getItem(UPDATE_DISMISSED_KEY);
            if (dismissed === APP_VERSION) return;

            try {
                // 3. Fetch the server version (with cache buster)
                const response = await fetch(`/version.json?t=${Date.now()}`);
                if (!response.ok) return;

                const data = await response.json();
                const serverVersion = data.version;

                // 4. Check if server version differs from the current bundled version
                if (serverVersion && serverVersion !== APP_VERSION) {
                    logger.info(`[Version Check] New version available: ${serverVersion} (current: ${APP_VERSION})`);
                    setShowUpdateBanner(true);
                } else {
                    // Version matches - update localStorage for tracking
                    localStorage.setItem(VERSION_KEY, APP_VERSION);
                    sessionStorage.removeItem(UPDATE_DISMISSED_KEY);
                }
            } catch (error) {
                logger.warn('[Version Check] Failed to check for updates:');
            }
        };

        // Initial check after 2 seconds
        const initialTimer = setTimeout(checkVersion, 2000);

        // Periodic check every 5 minutes (300000ms)
        const interval = setInterval(checkVersion, 300000);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(interval);
        };
    }, []);

    // Handle update - clear caches and reload
    const handleUpdate = useCallback(async () => {
        setIsUpdating(true);
        try {
            // Unregister all service workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(r => r.unregister()));
            }
            // Clear all caches
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }
            // Small delay to show animation
            await new Promise(r => setTimeout(r, 500));
            // Force reload
            window.location.reload();
        } catch (_e) {
            // Fallback - just reload
            window.location.reload();
        }
    }, []);

    // Handle dismiss - hide banner for this session
    const handleDismiss = useCallback(() => {
        sessionStorage.setItem(UPDATE_DISMISSED_KEY, APP_VERSION);
        setShowUpdateBanner(false);
    }, []);

    // Update Banner Portal
    if (showUpdateBanner) {
        return ReactDOM.createPortal(
            <div style={{ zIndex: Z_INDEX.TOAST }} className="fixed bottom-4 left-4 right-4 flex justify-center animate-in slide-in-from-bottom duration-100">
                <div className="bg-indigo-600 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4 max-w-md w-full relative">
                    <button
                        onClick={handleDismiss}
                        className="absolute top-1 right-1 text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors z-10"
                        aria-label="Dismiss update notification"
                    >
                        <X size={18} />
                    </button>
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0 mt-2 lg:mt-0">
                        <Download size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">Update Available</p>
                        <p className="text-white/70 text-xs">Tap to refresh and get the latest version</p>
                    </div>
                    <button
                        onClick={handleUpdate}
                        disabled={isUpdating}
                        className="bg-white text-indigo-600 font-bold px-4 py-2 rounded-xl hover:bg-indigo-50 transition-colors active:scale-95 flex items-center gap-2 disabled:opacity-80"
                    >
                        {isUpdating ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Updating...
                            </>
                        ) : (
                            <>
                                <RefreshCw size={16} />
                                Update
                            </>
                        )}
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    return null;
};

export default PWAUpdater;
