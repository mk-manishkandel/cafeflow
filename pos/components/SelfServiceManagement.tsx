import React, { useState, useEffect } from 'react';
import {
    LayoutGrid, ReceiptText, RefreshCcw,
    Power, Layers, GitBranch
} from 'lucide-react';
import { PageHeader } from './shared/PageHeader';
import { useBranch } from '../contexts/BranchContext';
import { useUI } from './ui/UIContext';
import { useSocket } from '../contexts/SocketContext';
import { API_BASE, authenticatedFetch } from '../services/storageService';
import { useSearchParams } from 'react-router-dom';
import logger from '../utils/logger';

// Modular Components
import StatusTab from './self-service/StatusTab';
import MenuTab from './self-service/MenuTab';
import TransactionsTab from './self-service/TransactionsTab';
import LogsTab from './self-service/LogsTab';
import TransactionDetailModal from './self-service/TransactionDetailModal';
import LogDetailModal from './self-service/LogDetailModal';

interface SelfServiceStatus {
    isSelfServiceEnabled: boolean;
    isMainBranch: boolean;
    branchStatuses: Array<{
        id: string;
        name: string;
        isEnabled: boolean;
    }>;
    menuItems: Array<{
        id: string;
        name: string;
        category: string;
        isSelfService: boolean;
        price: number;
        image: string;
        branchName: string;
        branchId: string;
    }>;
}

interface Transaction {
    id: string;
    total_amount: number;
    date: string;
    status: string;
    payment_method: string;
    recipient_name: string;
    branch_name?: string;
    items: any[] | string;
}

interface ActivityLog {
    id: number;
    session_id: string;
    action: string;
    metadata: any;
    created_at: string;
    branch_id: string;
    branch_name: string;
    ip_address?: string;
    user_agent?: string;
}

const SelfServiceManagement = () => {
    const { currentBranch } = useBranch();
    const { showToast } = useUI();
    const { joinBranch, lastEvent } = useSocket();
    const [searchParams, setSearchParams] = useSearchParams();

    // Tab persistent via URL
    const activeTab = (searchParams.get('tab') as 'status' | 'menu' | 'transactions' | 'logs') || 'status';
    const setActiveTab = (tab: string) => {
        setSearchParams({ tab });
    };

    const [status, setStatus] = useState<SelfServiceStatus | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
    const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
    const [filterBranchId, setFilterBranchId] = useState<string | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalTransactions, setTotalTransactions] = useState(0);
    const [totalLogs, setTotalLogs] = useState(0);
    const itemsPerPage = 20;

    const tabs = [
        { id: 'status', label: 'Overall Status', icon: Power },
        { id: 'menu', label: 'Self-Service Menu', icon: LayoutGrid },
        { id: 'transactions', label: 'Order History', icon: ReceiptText },
        { id: 'logs', label: 'Activity Logs', icon: Layers }
    ];

    const fetchStatus = async () => {
        try {
            const res = await authenticatedFetch(`${API_BASE}/self-service/status`);
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch (err) {
            logger.error('Failed to fetch status', err);
        }
    };

    const fetchTransactions = async (page = 1, branchFilter?: string | null) => {
        try {
            const branch = branchFilter !== undefined ? branchFilter : filterBranchId;
            let url = `${API_BASE}/self-service/transactions?page=${page}&limit=${itemsPerPage}`;
            if (branch) url += `&filterBranchId=${branch}`;
            const res = await authenticatedFetch(url);
            if (res.ok) {
                const data = await res.json();
                setTransactions(data.data);
                setTotalPages(data.pagination.totalPages);
                setTotalTransactions(data.pagination.total);
                setCurrentPage(data.pagination.page);
            }
        } catch (err) {
            logger.error('Failed to fetch transactions', err);
        }
    };

    const fetchLogs = async (page = 1, sessionId?: string, branchFilter?: string | null) => {
        try {
            const branch = branchFilter !== undefined ? branchFilter : filterBranchId;
            let url = `${API_BASE}/self-service/logs?page=${page}&limit=${itemsPerPage}`;
            if (sessionId) url += `&sessionId=${sessionId}`;
            if (branch) url += `&filterBranchId=${branch}`;
            const res = await authenticatedFetch(url);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.data);
                setTotalPages(data.pagination.totalPages);
                setTotalLogs(data.pagination.total);
                setCurrentPage(data.pagination.page);
            }
        } catch (err) {
            logger.error('Failed to fetch logs', err);
        }
    };

    const toggleBranch = async (enabled: boolean, branchId?: string) => {
        // Optimistic update
        setStatus(prev => {
            if (!prev) return null;
            if (prev.isMainBranch && branchId) {
                return {
                    ...prev,
                    branchStatuses: (prev.branchStatuses || []).map(b => b.id === branchId ? { ...b, isEnabled: enabled } : b)
                };
            }
            return { ...prev, isSelfServiceEnabled: enabled };
        });

        try {
            const res = await authenticatedFetch(`${API_BASE}/self-service/toggle-branch`, {
                method: 'POST',
                body: JSON.stringify({ enabled, branchId })
            });
            if (res.ok) {
                showToast(`Self-service ${enabled ? 'enabled' : 'disabled'}`, 'success');
                fetchStatus();
            } else {
                throw new Error();
            }
        } catch (_err) {
            showToast('Failed to update status', 'error');
            fetchStatus();
        }
    };

    const toggleItem = async (itemId: string, enabled: boolean) => {
        setStatus(prev => prev ? {
            ...prev,
            menuItems: (Array.isArray(prev.menuItems) ? prev.menuItems : []).map(item =>
                item.id === itemId ? { ...item, isSelfService: enabled } : item
            )
        } : null);

        try {
            const res = await authenticatedFetch(`${API_BASE}/self-service/toggle-item`, {
                method: 'POST',
                body: JSON.stringify({ itemId, enabled })
            });
            if (!res.ok) throw new Error();
        } catch (_err) {
            showToast('Failed to update item visibility', 'error');
            fetchStatus();
        }
    };

    const toggleItems = async (itemIds: string[], enabled: boolean) => {
        setStatus(prev => prev ? {
            ...prev,
            menuItems: (Array.isArray(prev.menuItems) ? prev.menuItems : []).map(item =>
                itemIds.includes(item.id) ? { ...item, isSelfService: enabled } : item
            )
        } : null);

        try {
            const res = await authenticatedFetch(`${API_BASE}/self-service/toggle-items`, {
                method: 'POST',
                body: JSON.stringify({ itemIds, isSelfService: enabled })
            });
            if (!res.ok) throw new Error();
            showToast(`${itemIds.length} item${itemIds.length !== 1 ? 's' : ''} ${enabled ? 'enabled' : 'disabled'}`, 'success');
        } catch (_err) {
            showToast('Failed to update items visibility', 'error');
            fetchStatus();
        }
    };

    const fetchData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        const fetches = [fetchStatus()];
        if (activeTab === 'transactions') fetches.push(fetchTransactions(1, filterBranchId));
        if (activeTab === 'logs') fetches.push(fetchLogs(1, selectedSessionId || undefined, filterBranchId));
        await Promise.all(fetches);
        if (showLoading) setLoading(false);
    };

    useEffect(() => {
        fetchData(true);
        if (currentBranch?.id) {
            joinBranch(currentBranch.id);
        }
    }, [currentBranch?.id, activeTab, selectedSessionId, filterBranchId]);

    // WebSocket Real-time updates
    useEffect(() => {
        if (!lastEvent) return;

        if (lastEvent.type === 'transaction:created' || lastEvent.type === 'data:updated') {
            if (activeTab === 'transactions') fetchTransactions(currentPage, filterBranchId);
            if (lastEvent.type === 'data:updated') fetchStatus();
        }

        if (lastEvent.type === 'fnb:activity' && activeTab === 'logs') {
            fetchLogs(currentPage, selectedSessionId || undefined, filterBranchId);
        }
    }, [lastEvent, activeTab, currentPage, selectedSessionId]);

    const filteredMenu = (Array.isArray(status?.menuItems) ? status!.menuItems : []).filter(item => {
        if (filterBranchId && item.branchId !== filterBranchId) return false;
        return (item?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item?.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50/50">
            <div className="p-4 sm:p-6 lg:p-8 space-y-6">
                <PageHeader
                    title="FnB Self-Service"
                    subtitle="Monitor real-time interactions and manage kiosk availability"
                    icon={LayoutGrid}
                    actions={[]}
                />

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] flex flex-col">
                    {/* Navigation Tabs - Mobile Friendly Horizontal Scroll */}
                    <div className="flex border-b border-slate-200 bg-slate-50/30 overflow-x-auto scrollbar-hide whitespace-nowrap min-h-[52px] sm:min-h-[56px]">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-5 sm:px-6 py-3.5 sm:py-4 text-[10px] sm:text-xs font-bold transition-all border-b-2 -mb-px flex-shrink-0 relative ${activeTab === tab.id
                                        ? 'border-indigo-600 text-indigo-600 bg-white shadow-[0_4px_12px_-4px_rgba(79,70,229,0.1)]'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                        }`}
                                >
                                    <Icon size={14} className="sm:w-4 sm:h-4" />
                                    <span className="uppercase tracking-wider leading-tight">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Branch Filter — only visible to Main Branch (super admin) */}
                    {status?.isMainBranch && (status.branchStatuses || []).length > 0 && (
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/50 overflow-x-auto scrollbar-hide">
                            <GitBranch size={13} className="text-slate-400 flex-shrink-0" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex-shrink-0">Branch</span>
                            <div className="flex gap-1.5 flex-nowrap">
                                <button
                                    onClick={() => setFilterBranchId(null)}
                                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all flex-shrink-0 ${
                                        !filterBranchId
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    All Branches
                                </button>
                                {(status.branchStatuses || []).map(branch => (
                                    <button
                                        key={branch.id}
                                        onClick={() => setFilterBranchId(branch.id)}
                                        className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all flex-shrink-0 ${
                                            filterBranchId === branch.id
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                        }`}
                                    >
                                        {branch.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {loading && !status ? (
                            <div className="flex flex-col items-center justify-center p-20 text-slate-400">
                                <RefreshCcw size={48} className="animate-spin mb-4 opacity-10" />
                                <p className="font-medium text-sm">Loading System Data...</p>
                            </div>
                        ) : (
                            <div className="h-full">
                                {activeTab === 'status' && status && (
                                    <StatusTab
                                        config={status}
                                        onToggle={(key, val) => {
                                            if (key.startsWith('branch_')) {
                                                toggleBranch(val, key.replace('branch_', ''));
                                            } else if (key === 'isSelfServiceEnabled') {
                                                toggleBranch(val);
                                            }
                                        }}
                                    />
                                )}

                                {activeTab === 'menu' && status && (
                                    <MenuTab
                                        searchQuery={searchQuery}
                                        setSearchQuery={setSearchQuery}
                                        filteredMenu={filteredMenu}
                                        onToggle={toggleItem}
                                        onBulkToggle={toggleItems}
                                        isMainBranch={status?.isMainBranch || false}
                                    />
                                )}

                                {activeTab === 'transactions' && (
                                    <TransactionsTab
                                        transactions={transactions}
                                        setSelectedTx={setSelectedTx}
                                        isMainBranch={status?.isMainBranch || false}
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        totalTransactions={totalTransactions}
                                        onPageChange={fetchTransactions}
                                        itemsPerPage={itemsPerPage}
                                    />
                                )}

                                {activeTab === 'logs' && (
                                    <LogsTab
                                        logs={logs}
                                        selectedSessionId={selectedSessionId}
                                        setSelectedSessionId={setSelectedSessionId}
                                        setSelectedLog={setSelectedLog}
                                        isMainBranch={status?.isMainBranch || false}
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        totalLogs={totalLogs}
                                        onPageChange={(p) => fetchLogs(p, selectedSessionId || undefined)}
                                        itemsPerPage={itemsPerPage}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
            <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
};
export default SelfServiceManagement;
