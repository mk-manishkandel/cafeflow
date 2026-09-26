import React, { useState, useEffect, useCallback } from 'react';
import { getLocalDateString } from '../utils/dateUtils';
import { getTransactions, getStaff, refundTransaction, changeTransactionStaff } from '../services/storageService';
import { clearCache } from '../services/apiCache';
import { Transaction, Staff } from '../types';
import { isAbortError } from '../services/errors';
import { History, Download } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useBranch, BranchSelector } from '../contexts/BranchContext';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useDebounce } from '../hooks/useDebounce';
import { printKOT } from '../utils/printUtils';
import { useUI } from '../components/ui/UIContext';
import { PageHeader } from './shared/PageHeader';
import logger from '../utils/logger';
import { normalizeList, normalizePagination } from './shared/apiNormalize';
import { getItemRaw } from '../utils/safeStorage';
import { SearchInput } from './shared/SearchInput';
import { DateRangePicker } from './shared/DateRangePicker';
import { RefundMethodModal } from './Managers/Modals/RefundMethodModal';
import { ExportReportModal } from './shared/ExportReportModal';
import Pagination from './Pagination';
import { TransactionTable } from './Managers/Tables/TransactionTable';
import { ChangeStaffModal } from './Managers/Modals/ChangeStaffModal';
import { TableSkeleton } from './skeletons/TableSkeleton';

const getPrinterMode = (): 'LOCAL' | 'NETWORK' | 'OFF' => {
  const posMode = getItemRaw('printer_mode_pos', '');
  const posnMode = getItemRaw('printer_mode_posn', '');
  const raw = posMode || posnMode || 'LOCAL';
  return (raw === 'SERVER' ? 'NETWORK' : raw) as 'LOCAL' | 'NETWORK' | 'OFF';
};

const Transactions = () => {
  const { currentBranch } = useBranch();
  const can = usePermission();
  const { showToast } = useUI();

  // Branch filter derived from the global BranchSelector (same pattern as ConsumptionReports).
  // Main Branch = no filter (show all branches). Any specific branch = filter to that branch.
  const isMainBranch = currentBranch?.name === 'Main Branch';
  const filterBranchId = isMainBranch ? undefined : currentBranch?.id;

  // Core Data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Date Filters
  const [startDate, setStartDate] = useState(() => getLocalDateString(new Date()));
  const [endDate, setEndDate] = useState(() => getLocalDateString(new Date()));

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [newStaffId, setNewStaffId] = useState('');
  const [txnToRefund, setTxnToRefund] = useState<Transaction | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const loadData = useCallback(async (isBackground = false, signal?: AbortSignal) => {
    if (!isBackground) setLoading(true);
    try {
      const txnResponse = await getTransactions(filterBranchId, startDate, endDate, undefined, undefined, itemsPerPage, currentPage, debouncedSearchQuery, undefined, undefined, signal);

      const rows = normalizeList<Transaction>(txnResponse);
      setTransactions(rows);
      const pagination = normalizePagination(txnResponse);
      setTotalItems(pagination?.total ?? rows.length);
      setTotalPages(pagination?.totalPages ?? 1);
    } catch (error: any) {
      // A cancelled request (superseded by a newer filter/page change) is not a failure.
      if (isAbortError(error)) return;
      logger.error('Failed to load transactions:', error);
      showToast('Failed to load transactions', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterBranchId, startDate, endDate, currentPage, debouncedSearchQuery, itemsPerPage, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(false, controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // Reset page on filter changes
  useEffect(() => { setCurrentPage(1); }, [debouncedSearchQuery]);
  useEffect(() => { setCurrentPage(1); }, [currentBranch?.id]);

  // Real-time updates — clear client cache so new transactions appear immediately.
  // Pass filterBranchId so this component joins the branch room and receives direct
  // transaction:created/refunded/deleted events, not just the broadcast data:updated.
  useRealTimeUpdate({
    onUpdate: () => { clearCache('transactions'); loadData(true); },
    dataTypes: ['transaction'],
    branchId: filterBranchId,
    debounceMs: 2000,
  });

  // Removed old Debounced Search Handler useEffect


  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleRefundClick = useCallback((txn: Transaction) => {
    setTxnToRefund(txn);
    setIsRefundModalOpen(true);
  }, []);

  const handleConfirmRefund = useCallback(async (refundMethod: string) => {
    if (!txnToRefund) return;
    try {
      await refundTransaction(txnToRefund.id, refundMethod);
      showToast('Transaction refunded successfully', 'success');
      setIsRefundModalOpen(false);
      setTxnToRefund(null);
      loadData();
    } catch (err: any) {
      showToast("Refund Failed: " + (err.message || "Unknown error"), 'error');
    }
  }, [txnToRefund, loadData]);

  const openChangeStaffModal = useCallback(async (txn: Transaction) => {
    setSelectedTxn(txn);
    setNewStaffId(txn.staffId || '');
    setIsModalOpen(true);

    if (staffList.length === 0) {
      try {
        const staff = await getStaff();
        setStaffList(normalizeList<Staff>(staff));
      } catch (err) {
        logger.error("Failed to load staff list for correction:", err);
        showToast('Failed to load staff list', 'error');
      }
    }
  }, [staffList]);

  const handleChangeStaffSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTxn && newStaffId) {
      try {
        await changeTransactionStaff(selectedTxn.id, newStaffId);
        showToast('Staff changed successfully', 'success');
        setIsModalOpen(false);
        loadData();
      } catch (err: any) {
        showToast("Change Staff Failed: " + (err.message || "Unknown error"), 'error');
      }
    }
  }, [selectedTxn, newStaffId, loadData]);

  const isAllBranches = !filterBranchId;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Transactions history"
        subtitle="All transactions across all branches — filter by branch, date or search."
        icon={History}
        actions={[
          {
            label: 'Export Excel',
            icon: Download,
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
            placeholder="Search by staff, item or ID..."
            className="!max-w-[300px]"
          />
        </div>
      </PageHeader>

      {loading ? (
        <TableSkeleton hasHeader={false} rows={10} columns={isAllBranches ? 9 : 8} />
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <TransactionTable
            transactions={transactions}
            loading={loading}
            isMainBranch={isAllBranches}
            onRefund={handleRefundClick}
            onChangeStaff={openChangeStaffModal}
            onReprint={(txn) => printKOT(txn, (txn as any).paymentMethod || 'N/A', (txn as any).branchName || currentBranch?.name || '', getPrinterMode())}
            canEdit={can('TRANSACTION_EDIT')}
            canRefund={can('TRANSACTION_REFUND')}
            canReprint={(txn) => (new Date().getTime() - new Date(txn.timestamp).getTime()) < 5 * 60 * 1000}
            canRefundTxn={(txn) => (new Date().getTime() - new Date(txn.timestamp).getTime()) < 6 * 60 * 60 * 1000}
            searchQuery={searchQuery}
          />

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            itemsPerPage={itemsPerPage}
            totalItems={totalItems}
          />

          <ExportReportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            exportApiRoute={`/transactions/export?startDate=${startDate}&endDate=${endDate}&branchId=${filterBranchId || ''}`}
            defaultFileName={`transactions_${startDate}_to_${endDate}.xlsx`}
          />
        </div>
      )}

      <ChangeStaffModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleChangeStaffSubmit}
        selectedTxn={selectedTxn}
        newStaffId={newStaffId}
        setNewStaffId={setNewStaffId}
        staffList={staffList}
      />

      <RefundMethodModal
        isOpen={isRefundModalOpen}
        onClose={() => { setIsRefundModalOpen(false); setTxnToRefund(null); }}
        onConfirm={handleConfirmRefund}
        txn={txnToRefund}
        branchId={filterBranchId}
      />
    </div>
  );
};

export default Transactions;