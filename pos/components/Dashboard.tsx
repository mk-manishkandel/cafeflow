import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getLocalDateString } from '../utils/dateUtils';
import { getBranches, getDashboardStats, Branch } from '../services/storageService';
import { Users, UserCheck, Zap, AlertCircle, RefreshCw } from 'lucide-react';
import { BranchSelector, useBranch } from '../contexts/BranchContext';
import { usePermission } from '../hooks/usePermission';
import { DateFilterControl } from './dashboard/DateFilterControl';
import { SalesBreakdown } from './dashboard/SalesBreakdown';
import { PaymentBreakdown } from './dashboard/PaymentBreakdown';
import { StatCardsGrid } from './dashboard/StatCardsGrid';
import { RevenueSource } from './dashboard/RevenueSource';
import { PopularItems } from './dashboard/PopularItems';
import { BranchPerformance } from './dashboard/BranchPerformance';
import { RecentPayments } from './dashboard/RecentPayments';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useCurrentDate } from '../hooks/useCurrentDate';
import { DashboardSkeleton } from './skeletons/DashboardSkeleton';
import { useUI } from '../components/ui/UIContext';
import { clearCache } from '../services/apiCache';
import logger from '../utils/logger';

const Dashboard = () => {
  const [_isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const today = useCurrentDate();
  const { currentBranch } = useBranch();
  const { showToast } = useUI();
  const can = usePermission();
  const [_branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(() => can('VIEW_DASHBOARD'));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [staffCount, setStaffCount] = useState(0);
  const [menuCount, setMenuCount] = useState(0);

  // Date State
  const [viewMode, setViewMode] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState(() => getLocalDateString(new Date()));
  const [customEndDate, setCustomEndDate] = useState(() => getLocalDateString(new Date()));

  // Parse "YYYY-MM-DD" as local wall-clock parts — new Date(str) would parse
  // it as UTC midnight and shift the day for timezones west of GMT.
  const parseDateOnly = useCallback((str: string) => {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, []);

  const dateRange = useMemo(() => {
    const currentDay = new Date(today);
    currentDay.setHours(0, 0, 0, 0);

    const endToday = new Date(today);
    endToday.setHours(23, 59, 59, 999);

    if (viewMode === 'yesterday') {
      const start = new Date(currentDay);
      start.setDate(start.getDate() - 1);
      const end = new Date(endToday);
      end.setDate(end.getDate() - 1);
      return { start, end };
    } else if (viewMode === 'custom') {
      const start = parseDateOnly(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = parseDateOnly(customEndDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    return { start: currentDay, end: endToday };
  }, [viewMode, customStartDate, customEndDate, today, parseDateOnly]);

  useEffect(() => {
    const fetchBranchesData = async () => {
      try {
        const allBranches = await getBranches();
        setBranches(allBranches);
      } catch (error) {
        logger.error("Failed to load branches", error);
        showToast('Failed to load branches', 'error');
      }
    };
    fetchBranchesData();
  }, []);

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalCount: 0,
    paymentBreakdown: [],
    typeBreakdown: [],
    salesChart: [],
    topItems: [],
    branchBreakdown: [],
    recentPayments: []
  });

  // Track whether stats have been loaded at least once so we can skip the full-page
  // spinner on silent refreshes — without putting stats.totalCount in the dep array
  // (which would create a fetch loop: fetch → stats update → fetchStats recreated → fetch again)
  const hasStatsRef = useRef(false);

  // Reset flag when branch or date range changes so we show the spinner for new filters
  useEffect(() => {
    hasStatsRef.current = false;
  }, [currentBranch?.id, dateRange.start, dateRange.end]);

  const fetchStats = useCallback(async (showLoading = true) => {
    const isMainBranch = currentBranch?.name === 'Main Branch';
    const branchIdFilter = isMainBranch ? undefined : currentBranch?.id;
    const startDateStr = getLocalDateString(dateRange.start);
    const endDateStr = getLocalDateString(dateRange.end);

    // Performance: Only show loading if we don't have data yet for this filter
    // This makes returning to the dashboard feel 'instant'
    const shouldShowLoading = showLoading && !hasStatsRef.current;
    if (shouldShowLoading) { setLoading(true); setFetchError(null); }

    try {
      const data = await getDashboardStats(branchIdFilter, startDateStr, endDateStr);
      setStats(data);
      hasStatsRef.current = true;
      setFetchError(null);
      if (data.staffCount !== undefined) setStaffCount(data.staffCount);
      if (data.menuCount !== undefined) setMenuCount(data.menuCount);
    } catch (error) {
      logger.error("Failed to load dashboard stats", error);
      if (!hasStatsRef.current) {
        setFetchError('Failed to load dashboard data. Please check your connection and try again.');
      } else {
        showToast("Failed to update dashboard data. Please try again.", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [currentBranch, dateRange, showToast]);

  useEffect(() => {
    if (!can('VIEW_DASHBOARD')) return;
    fetchStats(true);
  }, [fetchStats]);

  const silentRefresh = useCallback(() => {
    clearCache('dashboard-stats');
    fetchStats(false);
  }, [fetchStats]);

  useRealTimeUpdate({
    onUpdate: silentRefresh,
    dataTypes: ['transaction'],
    // null: server emits transaction events globally so all clients — including
    // admin on Main Branch — receive the push without needing to join a room.
    branchId: null,
    debounceMs: 2000,
  });

  const statsByType = useMemo(() => {
    const config: any = {
      'Staff': { icon: Users, color: 'bg-emerald-500', iconColor: 'text-emerald-500' },
      'Consumer': { icon: UserCheck, color: 'bg-blue-500', iconColor: 'text-blue-500' },
      'POS-N': { icon: Zap, color: 'bg-indigo-500', iconColor: 'text-indigo-500' }
    };

    return (stats.typeBreakdown || []).map((item: any) => ({
      ...item,
      ...(config[item.name] || config['Staff'])
    }));
  }, [stats.typeBreakdown]);

  const isMainBranch = currentBranch?.name === 'Main Branch';

  if (!can('VIEW_DASHBOARD')) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <DashboardSkeleton />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-red-100 shadow-sm gap-4">
          <AlertCircle size={40} className="text-red-400" aria-hidden="true" />
          <div className="text-center">
            <p className="text-slate-700 font-semibold text-base">Failed to load dashboard</p>
            <p className="text-slate-400 text-sm mt-1">{fetchError}</p>
          </div>
          <button
            onClick={() => fetchStats(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Overview <span className="font-semibold text-slate-900">
              {viewMode === 'custom'
                ? `${parseDateOnly(customStartDate).toLocaleDateString()} - ${parseDateOnly(customEndDate).toLocaleDateString()}`
                : dateRange.start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <BranchSelector className="w-36 h-9" />
          <DateFilterControl
            viewMode={viewMode}
            setViewMode={setViewMode}
            customStartDate={customStartDate}
            setCustomStartDate={setCustomStartDate}
            customEndDate={customEndDate}
            setCustomEndDate={setCustomEndDate}
          />
        </div>
      </div>

      <StatCardsGrid
        loading={loading}
        totalSales={stats.totalRevenue}
        transactionCount={stats.totalCount}
        menuCount={menuCount}
        staffCount={staffCount}
      />

      <SalesBreakdown statsByType={statsByType} />

      <PaymentBreakdown statsByPayment={stats.paymentBreakdown} />

      {isMainBranch && <BranchPerformance branchBreakdown={stats.branchBreakdown} />}

      <RecentPayments recentPayments={(stats as any).recentPayments || []} isMainBranch={isMainBranch} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueSource
          loading={loading}
          statsByType={statsByType}
          totalRevenue={stats.totalRevenue}
        />
        <PopularItems
          loading={loading}
          topItems={stats.topItems}
        />
      </div>
    </div>
  );
};

export default Dashboard;