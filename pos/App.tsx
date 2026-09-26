import React, { useEffect, Suspense, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, BrowserRouter as Router, Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import logger from './utils/logger';
import Sidebar from './components/Sidebar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './components/Login';
import PWAUpdater from './components/PWAUpdater';
import PullToRefresh from './components/PullToRefresh';
import ErrorBoundary from './components/ErrorBoundary';
import NotFound from './components/NotFound';
import { SkipLinks } from './components/shared/SkipLinks';
import { OfflineBlocker } from './components/shared/OfflineBlocker';
import { ReconnectBanner } from './components/shared/ReconnectBanner';
import { useAutoLogout } from './hooks/useAutoLogout';
import { useSocket } from './contexts/SocketContext';
import { ROLES } from './constants/roles';

// Providers
import { BranchProvider, useBranch } from './contexts/BranchContext';
import { SocketProvider } from './contexts/SocketContext';
import { UIProvider } from './components/ui/UIContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { usePermission } from './hooks/usePermission';

// Lazy Loaded Components
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const SetupPage = React.lazy(() => import('./components/SetupPage'));
const POS = React.lazy(() => import('./components/POS'));
const POSN = React.lazy(() => import('./components/POS-N'));
const AuditLogs = React.lazy(() => import('./components/AuditLogs'));
const MenuManager = React.lazy(() => import('./components/MenuManager'));
const StaffManager = React.lazy(() => import('./components/StaffManager'));
const Transactions = React.lazy(() => import('./components/Transactions'));
const ConsumptionReports = React.lazy(() => import('./components/ConsumptionReports'));
const ItemSalesReport = React.lazy(() => import('./components/ItemSalesReport'));
const UserManager = React.lazy(() => import('./components/UserManager'));
const BusinessSetup = React.lazy(() => import('./components/BusinessSetup'));
const ConsumerManager = React.lazy(() => import('./components/ConsumerManager'));
const RoleManager = React.lazy(() => import('./components/RoleManager'));
const SelfServiceManagement = React.lazy(() => import('./components/SelfServiceManagement'));

// --- Helper Components ---

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-slate-50/30 animate-in fade-in duration-100 delay-200">
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      <p className="text-slate-400 text-sm font-medium animate-pulse">Loading...</p>
    </div>
  </div>
);

const MobileHeader = ({ onMenuClick }: { onMenuClick: () => void }) => {
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  return (
    <div className="flex md:hidden bg-white/80 glass-panel border-b border-slate-200 px-4 py-3 items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg">
          <Menu className="w-6 h-6" />
        </button>
        <h1
          className="font-bold text-slate-800 text-lg truncate max-w-[200px] cursor-pointer active:opacity-70"
          onClick={() => navigate('/dashboard')}
        >
          {currentBranch?.name || 'BicLatte POS'}
        </h1>
      </div>
    </div>
  );
};

// Watches for server-initiated session invalidation events (user deleted / role changed)
// and forces an immediate logout so the change takes effect without waiting for JWT expiry.
const SessionGuard: React.FC = () => {
  const { logout, user } = useAuth();
  const { isConnected, lastEvent, joinUserRoom } = useSocket();

  // (Re-)join the user-specific socket room on connect and reconnect.
  // Socket.IO drops room membership on disconnect, so this handles reconnects too.
  useEffect(() => {
    if (isConnected && user?.id) {
      joinUserRoom(user.id);
    }
  }, [isConnected, user?.id, joinUserRoom]);

  useEffect(() => {
    if (lastEvent?.type === 'user:force-logout') {
      logout();
    }
  }, [lastEvent, logout]);

  return null;
};

// --- Helper Components ---

const DefaultRedirect = () => {
  const { user } = useAuth();
  const can = usePermission();
  if (user?.role?.toLowerCase() === ROLES.ADMIN || can('VIEW_DASHBOARD')) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/pos" replace />;
};

const LoginRedirect = () => {
  const location = useLocation();
  return <Navigate to="/login" state={{ from: location }} replace />;
};

// --- Layout Component ---

const MainLayout = ({ onLogout }: { onLogout: () => void }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(true);
  const location = useLocation();

  // Close mobile menu on route change (deferred to avoid a synchronous
  // setState-in-effect cascade)
  useEffect(() => {
    const id = window.setTimeout(() => setIsMobileMenuOpen(false), 0);
    return () => window.clearTimeout(id);
  }, [location.pathname]);

  const [refreshKey, setRefreshKey] = React.useState(0);

  const handleRefresh = async () => {
    // Soft refresh: Remount components to trigger their useEffect data fetches
    setRefreshKey(prev => prev + 1);
    await new Promise(resolve => setTimeout(resolve, 800));
  };

  return (
    <>
      <SkipLinks />
      <div className="flex h-screen bg-slate-50/50 overflow-hidden">
      {/* Mobile Sidebar Overlay - Always mounted but hidden/shifted for performance */}
      <div className={`fixed inset-0 z-[200] md:hidden transition-all duration-300 transform-gpu ${isMobileMenuOpen ? 'bg-black/50 opacity-100 visible pointer-events-auto' : 'bg-black/0 opacity-0 invisible pointer-events-none'}`} onClick={() => setIsMobileMenuOpen(false)}>
        <div
          className={`bg-white h-full w-72 shadow-2xl transition-transform duration-300 ease-out transform-gpu pointer-events-auto ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
          onClick={e => e.stopPropagation()}
        >
          <Sidebar
            className="h-full w-full"
            onLinkClick={() => setIsMobileMenuOpen(false)}
            onLogout={onLogout}
          />
        </div>
      </div>

      {/* Desktop Sidebar - Explicitly don't render on mobile to save memory/CPU */}
      <div className="hidden md:flex h-full">
        <Sidebar
          className={`h-full border-r border-slate-200 bg-white transition-all duration-300 transform-gpu ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onLogout={onLogout}
        />
      </div>

        <main id="main-content" className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Mobile Header Only - Explicitly hidden on desktop */}
          <div className="md:hidden shrink-0">
            <MobileHeader onMenuClick={() => setIsMobileMenuOpen(true)} />
          </div>

          <div className="flex-1 relative overflow-hidden" key={refreshKey}>
            <PullToRefresh onRefresh={handleRefresh}>
              <div className="h-full overflow-y-auto no-scrollbar pt-safe-top pb-safe-bottom">
                <div className="h-full">
                  <Suspense fallback={<LoadingFallback />}>
                    <Outlet />
                  </Suspense>
                </div>
              </div>
            </PullToRefresh>
          </div>
          <Footer />
        </main>
      </div>
    </>
  );
};

// --- Main App Logic ---

const AppContent = () => {
  const { isAuthenticated, authorizationChecked, login, logout, needsSetup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [prefetchError, setPrefetchError] = useState<Error | null>(null);

  // Re-throw any critical prefetch error so the nearest ErrorBoundary can catch it
  if (prefetchError) throw prefetchError;

  useAutoLogout({
    onLogout: logout,
    isActive: isAuthenticated,
  });

  if (!authorizationChecked) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <>
      <PWAUpdater />
      <div className="flex flex-col h-screen bg-slate-50">
        <ErrorBoundary>
          {!isAuthenticated ? (
            <Routes>
              {needsSetup && <Route path="/setup" element={<Suspense fallback={<LoadingFallback />}><SetupPage /></Suspense>} />}
              <Route path="/login" element={<Login onLogin={(_token, userData, incomingCsrfToken) => {
                login(userData, incomingCsrfToken);

                // BACKGROUND PRE-FETCH — use userData (login response), not stale 'user' state
                import('./services/storageService').then(services => Promise.all([
                  services.getMenu(userData?.branchId).catch(err => {
                    logger.error('Menu pre-fetch failed:', err);
                  }),
                  services.getCategories(userData?.branchId).catch(err => {
                    logger.error('Categories pre-fetch failed:', err);
                  }),
                  services.getPaymentMethods(userData?.branchId).catch(err => {
                    logger.error('Payment methods pre-fetch failed:', err);
                  })
                ])).catch(err => {
                  logger.error('Service pre-fetch failed:', err);
                  // Surface module-load failures to the ErrorBoundary
                  if (err instanceof TypeError || (err as any)?.name === 'ChunkLoadError') {
                    setPrefetchError(err instanceof Error ? err : new Error(String(err)));
                  }
                });

                // Smart Redirect: Preserve pathname AND search params
                const fromState = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
                const isAdmin = userData?.role?.toLowerCase() === ROLES.ADMIN;
                const fromPath = fromState?.pathname || (isAdmin ? '/dashboard' : '/pos');
                const fromSearch = fromState?.search || '';
                const fullPathLimit = fromPath + fromSearch;

                navigate(fullPathLimit, { replace: true });
              }} />} />
              <Route path="*" element={needsSetup ? <Navigate to="/setup" replace /> : <LoginRedirect />} />
            </Routes>
          ) : (
            <SocketProvider>
              <SessionGuard />
              <OfflineBlocker />
              <ReconnectBanner />
              <BranchProvider>
                <Routes>
                  <Route element={<MainLayout onLogout={logout} />}>
                    <Route path="/login" element={<Navigate to="/" replace />} />
                    <Route path="/" element={<DefaultRedirect />} />
                    <Route path="/dashboard" element={<ProtectedRoute permission="VIEW_DASHBOARD" element={<Dashboard />} />} />
                    <Route path="/pos" element={<ProtectedRoute permission="ACCESS_POS" element={<POS />} />} />
                    <Route path="/pos-n" element={<ProtectedRoute permission="ACCESS_POS" element={<POSN />} />} />
                    <Route path="/self-service" element={<ProtectedRoute permission="SELF_SERVICE_VIEW" element={<SelfServiceManagement />} />} />
                    <Route path="/menu" element={<ProtectedRoute permission="MENU_VIEW" element={<MenuManager />} />} />
                    <Route path="/staff" element={<ProtectedRoute permission="STAFF_VIEW" element={<StaffManager />} />} />
                    <Route path="/transactions" element={<ProtectedRoute permission="TRANSACTION_VIEW" element={<Transactions />} />} />
                    <Route path="/consumption-reports" element={<ProtectedRoute permission="VIEW_REPORTS" element={<ConsumptionReports />} />} />
                    <Route path="/item-sales-report" element={<ProtectedRoute permission="VIEW_ITEM_SALES_REPORT" element={<ItemSalesReport />} />} />
                    <Route path="/users" element={<ProtectedRoute permission="MANAGE_USERS" element={<UserManager />} />} />
                    <Route path="/roles" element={<ProtectedRoute permission="MANAGE_ROLES" element={<RoleManager />} />} />
                    <Route path="/business-setup" element={<ProtectedRoute element={<BusinessSetup />} />} />
                    <Route path="/consumers" element={<ProtectedRoute permission="CONSUMER_VIEW" element={<ConsumerManager />} />} />

                    <Route path="/audit-logs" element={<ProtectedRoute permission="VIEW_AUDIT_LOGS" element={<AuditLogs />} />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </BranchProvider>
            </SocketProvider>
          )}
        </ErrorBoundary>
      </div>
    </>
  );
};

// --- Root Component with Providers ---
const App = () => {
  return (
    <Router>
      <AuthProvider>
        <UIProvider>
          <AppContent />
        </UIProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;