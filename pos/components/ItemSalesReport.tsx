import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getLocalDateString } from '../utils/dateUtils';
import { getTransactions, getBranches, Branch } from '../services/storageService';
import { ItemSalesData } from '../types';
import { Package, Download, TrendingUp, DollarSign, ShoppingBag } from 'lucide-react';
import { useBranch, BranchSelector } from '../contexts/BranchContext';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { PageHeader } from './shared/PageHeader';
import { SearchInput } from './shared/SearchInput';
import { DateRangePicker } from './shared/DateRangePicker';
import { ReportStatCards } from './Reports/ReportStatCards';
import { ItemSalesTable } from './Reports/ItemSalesTable';
import { ItemSalesChart } from './Reports/ItemSalesChart';
import { useEntityManager } from '../hooks/useEntityManager';
import CustomSelect from './shared/CustomSelect';
import { Users, User, Layout } from 'lucide-react';
import { ExportReportModal } from './shared/ExportReportModal';
import { useUI } from './ui/UIContext';
import logger from '../utils/logger';


import { formatCurrency } from '../utils/currency';
const ItemSalesReport = () => {
    const { currentBranch } = useBranch();
    const { showToast } = useUI();

    const [loading, setLoading] = useState(true);
    const [salesData, setSalesData] = useState<ItemSalesData[]>([]);
    const [_branches, setBranches] = useState<Branch[]>([]);

    const [startDate, setStartDate] = useState(() => getLocalDateString(new Date()));
    const [endDate, setEndDate] = useState(() => getLocalDateString(new Date()));
    const [userType, setUserType] = useState<string[]>(['staff', 'consumer', 'pos-n']);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    useEffect(() => {
        const fetchBranches = async () => {
            try {
                const branchList = await getBranches();
                setBranches(branchList);
            } catch (error) {
                logger.error('Failed to load branches:', error);
                showToast('Failed to load branches', 'error');
            }
        };
        fetchBranches();
    }, []);

    const loadData = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        try {
            const isMainBranch = currentBranch?.name === 'Main Branch';
            const branchIdFilter = isMainBranch ? undefined : currentBranch?.id;

            const response = await getTransactions(
                branchIdFilter,
                startDate,
                endDate,
                undefined,
                undefined,
                10000,
                undefined,
                undefined,
                'item_sales',
                userType.length === 0 ? 'none' : userType.join(',')
            );

            let results: ItemSalesData[] = [];
            if ('data' in response) {
                results = response.data as any;
            } else if (Array.isArray(response)) {
                results = response as any;
            }

            setSalesData(results);
        } catch (error) {
            logger.error('Failed to load item sales data:', error);
            showToast('Failed to load item sales data', 'error');
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, [currentBranch, startDate, endDate, userType]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useRealTimeUpdate({
        onUpdate: () => loadData(true),
        dataTypes: ['transaction'],
        branchId: currentBranch?.id,
        debounceMs: 2000,
    });

    const {
        searchQuery, setSearchQuery,
        sortedData,
        sortKey, sortDir, handleSort
    } = useEntityManager<ItemSalesData>({
        data: salesData,
        initialSortKey: 'totalRevenue',
        initialSortDir: 'desc',
        filterFn: (item, query) =>
            item.itemName.toLowerCase().includes(query) ||
            item.branchName.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
    });

    const totals = useMemo(() => {
        const t = salesData.reduce((acc, item) => ({
            revenue: acc.revenue + item.totalRevenue,
            quantity: acc.quantity + item.quantity
        }), { revenue: 0, quantity: 0 });

        return [
            { label: 'Total Revenue', value: `${formatCurrency(t.revenue)}`, icon: DollarSign, trend: 'Overall Sales', color: 'emerald' },
            { label: 'Units Sold', value: t.quantity.toLocaleString(), icon: Package, trend: 'Net Movements', color: 'indigo' },
            { label: 'Best Seller', value: [...salesData].sort((a, b) => b.totalRevenue - a.totalRevenue)[0]?.itemName || '-', icon: TrendingUp, trend: 'Highest Contributor', color: 'purple' }
        ];
    }, [salesData]);

    const chartData = useMemo(() => {
        return [...salesData]
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 5)
            .map(item => ({
                name: item.itemName,
                revenue: item.totalRevenue
            }));
    }, [salesData]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-8 bg-slate-50/30">
            <PageHeader
                title="Item Analytics"
                subtitle="Deep dive into menu item performance and branch sales velocity."
                icon={ShoppingBag}
                actions={[
                    {
                        label: 'Download Analysis',
                        icon: Download,
                        onClick: () => setIsExportModalOpen(true),
                        className: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200/50"
                    }
                ]}
            />

            {/* Filter Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[280px]">
                    <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search items, categories, or branches..."
                        className="!border-none !bg-slate-50/50"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={setStartDate}
                        onEndDateChange={setEndDate}
                    />

                    <BranchSelector className="w-[180px] h-11 shrink-0" />

                    <div className="w-[200px] h-11 shrink-0">
                        <CustomSelect
                            value={userType}
                            onChange={setUserType}
                            isMulti
                            placeholder="All User Types"
                            options={[
                                { value: 'staff', label: 'Staff Only', icon: User },
                                { value: 'consumer', label: 'Consumer (Ext)', icon: Users },
                                { value: 'pos-n', label: 'POS-N (Direct)', icon: Layout }
                            ]}
                        />
                    </div>
                </div>
            </div>

            <ReportStatCards stats={totals} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <ItemSalesTable
                        data={sortedData}
                        loading={loading}
                        sortKey={sortKey as string}
                        sortDir={sortDir}
                        onSort={handleSort}
                    />
                </div>

                <div className="space-y-8">
                    <ItemSalesChart data={chartData} />

                    <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden group">
                        <div className="relative z-10">
                            <h4 className="font-black text-xl uppercase tracking-tight mb-2">Sales Summary</h4>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Aggregate across branches</p>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-3 border-b border-white/10">
                                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Total Valuation</span>
                                    <span className="font-bold tabular-nums">{formatCurrency(salesData.reduce((a, c) => a + c.totalRevenue, 0))}</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-white/10">
                                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Unique Items</span>
                                    <span className="font-bold tabular-nums">{salesData.length}</span>
                                </div>
                            </div>
                        </div>
                        <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <ShoppingBag size={180} />
                        </div>
                    </div>
                </div>
            </div>

            <ExportReportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                exportApiRoute={`/transactions/export-item-analytics?startDate=${startDate}&endDate=${endDate}&userType=${userType.length === 0 ? 'none' : userType.join(',')}&branchId=${currentBranch?.id || ''}`}
                defaultFileName={`item_sales_${startDate}_${endDate}.xlsx`}
            />
        </div>
    );
};

export default ItemSalesReport;
