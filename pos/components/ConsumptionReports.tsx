import React, { useState, useEffect, useCallback } from 'react';
import { getLocalDateString } from '../utils/dateUtils';
import { getTransactions } from '../services/storageService';
import { Transaction } from '../types';
import { FileSpreadsheet, PieChart } from 'lucide-react';
import { useBranch, BranchSelector } from '../contexts/BranchContext';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useDebounce } from '../hooks/useDebounce';
import { PageHeader } from './shared/PageHeader';
import { SearchInput } from './shared/SearchInput';
import { DateRangePicker } from './shared/DateRangePicker';
import { ConsumptionTable } from './Reports/ConsumptionTable';
import { ExportReportModal } from './shared/ExportReportModal';
import TransactionDetailModal from './self-service/TransactionDetailModal';
import Pagination from './Pagination';
import { useUI } from './ui/UIContext';
import logger from '../utils/logger';

const ConsumptionReports = () => {
  const { currentBranch } = useBranch();
  const { showToast } = useUI();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(() => getLocalDateString(new Date()));
  const [endDate, setEndDate] = useState(() => getLocalDateString(new Date()));
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  const fetchData = useCallback(async (isBackground = false) => {
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
        itemsPerPage,
        currentPage,
        debouncedSearchQuery,
        'consumption'
      );

      if (Array.isArray(response)) {
        setTransactions(response);
        setTotalItems(response.length);
        setTotalPages(1);
      } else {
        setTransactions(response.data);
        setTotalItems(response.pagination.total);
        setTotalPages(response.pagination.totalPages);
      }
    } catch (error) {
      logger.error('Failed to load consumption data:', error);
      showToast('Failed to load consumption data', 'error');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [currentBranch, startDate, endDate, currentPage, debouncedSearchQuery, itemsPerPage]);

  // Reset page when search query changes (debounced)
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery]);

  // Removed old manual debounce useEffect

  useEffect(() => {
    fetchData();
  }, [fetchData, currentPage, startDate, endDate, currentBranch?.id]);

  useRealTimeUpdate({
    onUpdate: () => fetchData(true),
    dataTypes: ['transaction'],
    branchId: currentBranch?.id,
    debounceMs: 2000,
  });

  const isMainBranch = currentBranch?.name === 'Main Branch';

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Consumption Reports"
        subtitle={isMainBranch ? "Detailed consumption history from all branches (Refunds excluded)." : "Track consumption trends and export data for accounting."}
        icon={PieChart}
        actions={[
          {
            label: 'Export Excel',
            icon: FileSpreadsheet,
            onClick: () => setIsExportModalOpen(true),
            disabled: transactions.length === 0,
            className: "bg-emerald-600 hover:bg-emerald-700 text-white"
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

          <BranchSelector className="h-11 min-w-[180px]" />

          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Filter staff or item..."
            className="!max-w-[300px]"
          />
        </div>
      </PageHeader>

      <ConsumptionTable
        transactions={transactions}
        loading={loading}
        isMainBranch={isMainBranch}
        searchQuery={searchQuery}
        onTransactionClick={setSelectedTx}
      />

      <div className="mt-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={totalItems}
        />

        <ExportReportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          exportApiRoute={`/transactions/export-consumption?startDate=${startDate}&endDate=${endDate}&searchQuery=${encodeURIComponent(searchQuery)}&branchId=${currentBranch?.id || ''}`}
          defaultFileName={`consumption_report_${startDate}_to_${endDate}.xlsx`}
        />
      </div>

      <TransactionDetailModal
        tx={selectedTx}
        onClose={() => setSelectedTx(null)}
      />
    </div>
  );
};

export default ConsumptionReports;