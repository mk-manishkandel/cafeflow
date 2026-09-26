import React, { useState, useEffect, useCallback } from 'react';
import { getLocalDateString } from '../utils/dateUtils';
import { getAuditLogs } from '../services/storageService';
import { ClipboardList, RefreshCw, Download } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useDebounce } from '../hooks/useDebounce';
import { useBranch } from '../contexts/BranchContext';
import { PageHeader } from './shared/PageHeader';
import { SearchInput } from './shared/SearchInput';
import Pagination from './Pagination';
import { AuditLogTable } from './Managers/Tables/AuditLogTable';
import { DateRangePicker } from './shared/DateRangePicker';
import { TableSkeleton } from './skeletons/TableSkeleton';
import { useUI } from './ui/UIContext';
import { ExportReportModal } from './shared/ExportReportModal';
import { isAbortError } from '../services/errors';
import logger from '../utils/logger';

const AuditLogs = () => {
    const can = usePermission();
    const { currentBranch } = useBranch();
    const { showToast: _showToast } = useUI();

    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Server Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 500);
    const ITEMS_PER_PAGE = 25;

    const [startDate, setStartDate] = useState(() => getLocalDateString());
    const [endDate, setEndDate] = useState(() => getLocalDateString());
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const loadLogs = useCallback(async (isBackground = false, signal?: AbortSignal) => {
        if (!isBackground) setLoading(true);
        try {
            const result = await getAuditLogs(currentPage, ITEMS_PER_PAGE, debouncedSearchQuery, startDate, endDate, signal);
            setLogs(result.data);
            setTotalPages(result.pagination.totalPages);
            setTotalItems(result.pagination.total);
            setLoadError(null);
        } catch (error: any) {
            // A cancelled request (superseded by a newer filter/page change) is not a failure.
            if (isAbortError(error)) return;
            logger.error('Failed to load logs:', error);
            setLoadError(error?.message || 'Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    }, [currentPage, debouncedSearchQuery, startDate, endDate]);

    useEffect(() => {
        if (!can('VIEW_AUDIT_LOGS')) return;
        const controller = new AbortController();
        loadLogs(false, controller.signal);
        return () => controller.abort();
    }, [loadLogs, can]);

    const auditDataTypes = React.useMemo(() => ['audit' as const], []);

    // Real-time updates
    useRealTimeUpdate({
        onUpdate: () => loadLogs(true),
        dataTypes: auditDataTypes,
        branchId: currentBranch?.id,
        debounceMs: 3000,
    });

    // Reset page when search query changes (debounced)
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchQuery]);

    // Permission guard — MUST come after all hooks
    if (!can('VIEW_AUDIT_LOGS')) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-slate-500 bg-white rounded-2xl border border-slate-200 m-8 shadow-sm">
                <ClipboardList size={48} className="mb-4 opacity-20 text-indigo-600" />
                <p className="font-bold text-lg text-slate-800">Access Denied</p>
                <p className="text-sm text-slate-500">You do not have permission to view audit logs.</p>
            </div>
        );
    }

    const isMainBranch = currentBranch?.name === 'Main Branch';

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <PageHeader
                title="System Audit Logs"
                subtitle="Track security events, data changes, and sensitive system actions."
                icon={ClipboardList}
                actions={[
                    {
                        label: 'Export Excel',
                        icon: Download,
                        onClick: () => setIsExportModalOpen(true),
                        disabled: loading || logs.length === 0,
                        className: "bg-emerald-600 hover:bg-emerald-700 text-white"
                    },
                    {
                        label: 'Refresh',
                        icon: RefreshCw,
                        onClick: () => loadLogs(),
                        isLoading: loading
                    }
                ]}
            >
                <div className="flex flex-wrap items-center gap-3">
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={setStartDate}
                        onEndDateChange={setEndDate}
                    />

                    <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search logs by action, user or details..."
                        className="!max-w-[320px]"
                    />
                </div>
            </PageHeader>

            {loading ? (
                <TableSkeleton hasHeader={false} rows={ITEMS_PER_PAGE} columns={5} />
            ) : loadError ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-red-200 text-center">
                    <p className="font-bold text-slate-800 mb-1">Failed to load audit logs</p>
                    <p className="text-sm text-slate-500 mb-4">{loadError}</p>
                    <button onClick={() => loadLogs()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">Retry</button>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <AuditLogTable
                        logs={logs}
                        loading={loading}
                        isMainBranch={isMainBranch}
                        searchQuery={searchQuery}
                    />

                    <div className="border-t border-slate-100 bg-slate-50/30">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            itemsPerPage={ITEMS_PER_PAGE}
                            totalItems={totalItems}
                        />
                    </div>
                </div>
            )}

            <ExportReportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                exportApiRoute={`/audit-logs/export?startDate=${startDate}&endDate=${endDate}&search=${encodeURIComponent(searchQuery)}`}
                defaultFileName={`audit_logs_${startDate}_to_${endDate}.xlsx`}
            />
        </div>
    );
};

export default AuditLogs;
