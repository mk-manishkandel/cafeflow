import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import {
    getConsumers, addConsumer, updateConsumer, deleteConsumer, API_BASE,
    authenticatedFetch, getPaymentMethods
} from '../services/storageService';
import { clearCache } from '../services/apiCache';
import { isAbortError } from '../services/errors';
import { Consumer, PaymentMethodSettings } from '../types';
import { Plus, User, FileSpreadsheet, Mail } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useStatement } from '../hooks/useStatement';
import { useUI } from './ui/UIContext';

import { useBranch } from '../contexts/BranchContext';
import { PageHeader } from './shared/PageHeader';
import { SearchInput } from './shared/SearchInput';
import logger from '../utils/logger';
import { normalizeList, normalizePagination } from './shared/apiNormalize';
import { CustomSelect } from './shared/CustomSelect';
import Pagination from './Pagination';

// Sub-components
import { ConsumerModal } from './Managers/Modals/ConsumerModal';
import { SettleBalanceModal } from './Managers/Modals/SettleBalanceModal';
import { AccountStatementModal } from './Managers/Modals/AccountStatementModal';
import { ConsumerTable } from './Managers/Tables/ConsumerTable';
import { SecureActionModal } from './shared/SecureActionModal';
import { LedgerModal } from './Managers/Modals/LedgerModal';
import { ExportReportModal } from './shared/ExportReportModal';
import { EmailActionModal } from './Managers/Modals/EmailActionModal';

import { formatCurrency } from '../utils/currency';
// Consumer form state shape — consolidated to avoid 5+ individual useState calls
interface ConsumerFormData {
    name: string;
    email: string;
    mobileNumber: string;
    category: string;
    studentId: string;
    remarks: string;
    allowance: string;
}
const EMPTY_CONSUMER_FORM: ConsumerFormData = {
    name: '',
    email: '',
    mobileNumber: '',
    category: 'Part-time',
    studentId: '',
    remarks: '',
    allowance: '0',
};

const ConsumerManager = () => {
    const can = usePermission();
    const { currentBranch } = useBranch();
    const [consumerList, setConsumerList] = useState<Consumer[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal Visibility
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSettleOpen, setIsSettleOpen] = useState(false);
    const [isLedgerOpen, setIsLedgerOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [ledgerEntity, setLedgerEntity] = useState<Consumer | null>(null);

    // Editing / State
    const [editingConsumer, setEditingConsumer] = useState<Consumer | null>(null);
    const [settleConsumer, setSettleConsumer] = useState<Consumer | null>(null);
    const [consumerToDelete, setConsumerToDelete] = useState<Consumer | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isSettling, setIsSettling] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Consumer form state — consolidated into a single object
    const EMPTY_FORM = EMPTY_CONSUMER_FORM;
    const [formData, setFormData] = useState<ConsumerFormData>(EMPTY_FORM);
    const updateField = <K extends keyof ConsumerFormData>(field: K, value: ConsumerFormData[K]) =>
        setFormData(prev => ({ ...prev, [field]: value }));

    // Destructure for readability and backward-compat in JSX/callbacks
    const { name, email, mobileNumber, category, studentId, remarks, allowance } = formData;
    const setName = (v: string) => updateField('name', v);
    const setEmail = (v: string) => updateField('email', v);
    const setMobileNumber = (v: string) => updateField('mobileNumber', v);
    const setCategory = (v: string) => updateField('category', v);
    const setStudentId = (v: string) => updateField('studentId', v);
    const setRemarks = (v: string) => updateField('remarks', v);
    const setAllowance = (v: string) => updateField('allowance', v);

    // Settle-specific state (separate from consumer form — different modal)
    const [settleBalance, setSettleBalance] = useState('');
    const [settleRemarks, setSettleRemarks] = useState('');
    const [settleMethod, setSettleMethod] = useState('');
    const [availableMethods, setAvailableMethods] = useState<PaymentMethodSettings[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const itemsPerPage = 15;
    const [sortKey, setSortKey] = useState<string>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [selectedConsumerIds, setSelectedConsumerIds] = useState<Set<string>>(new Set());
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    const handleSort = useCallback((key: string) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }, [sortKey]);

    // Statement Hook
    const {
        statementEntity, isStatementOpen, openStatement, closeStatement,
        transactions: statementTxns,
        startDate, setStartDate, endDate, setEndDate,
        downloadStatementCSV, sendStatementEmail, sendLoading,
        isSendDropdownOpen, setIsSendDropdownOpen,
        showCustomDate, setShowCustomDate,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        sendDropdownRef
    } = useStatement({
        type: 'CONSUMER',
        onSuccess: (msg) => showToast(msg, 'success'),
        onError: (err) => showToast(err, 'error')
    });

    // UI helper for valid token generation
    const { showToast } = useUI();

    const fetchConsumers = useCallback(async (isBackground = false, signal?: AbortSignal) => {
        if (!isBackground) setLoading(true);
        try {
            const result = await getConsumers(currentPage, itemsPerPage, debouncedSearchQuery, sortKey, sortDir, statusFilter, signal);
            const rows = normalizeList<Consumer>(result);
            setConsumerList(rows);
            const pagination = normalizePagination(result);
            setTotalPages(pagination?.totalPages ?? 1);
            setTotalItems(pagination?.total ?? rows.length);
        } catch (err) {
            // A cancelled request (superseded by a newer filter/page change) is not a failure.
            if (isAbortError(err)) return;
            logger.error('Failed to load consumers', err);
            showToast('Failed to load consumers', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast, currentPage, debouncedSearchQuery, sortKey, sortDir, statusFilter]);

    useEffect(() => {
        const controller = new AbortController();
        fetchConsumers(false, controller.signal);
        return () => controller.abort();
    }, [fetchConsumers]);

    // Reset page on search/sort/filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchQuery, sortKey, sortDir, statusFilter]);

    // Real-time updates
    useEffect(() => {
        const controller = new AbortController();
        const fetchMethods = async () => {
            try {
                const methods = normalizeList<PaymentMethodSettings>(await getPaymentMethods(currentBranch?.id, false, controller.signal));
                setAvailableMethods(methods);
                if (methods.length > 0 && !methods.find(m => m.name === settleMethod)) {
                    setSettleMethod(methods[0].name);
                }
            } catch (err) {
                if (isAbortError(err)) return;
                logger.error('Failed to load payment methods', err);
                showToast('Failed to load payment methods', 'error');
            }
        };
        fetchMethods();
        return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentBranch?.id]);

    useRealTimeUpdate({
        onUpdate: () => fetchConsumers(true),
        dataTypes: ['consumer', 'transaction'],
        branchId: currentBranch?.id,
        debounceMs: 2000,
    });

    const openLedger = useCallback((consumer: Consumer) => {
        setLedgerEntity(consumer);
        setIsLedgerOpen(true);
    }, []);

    const openModal = useCallback((consumer?: Consumer) => {
        if (consumer) {
            setEditingConsumer(consumer);
            setFormData({
                name: consumer.name,
                email: consumer.email,
                mobileNumber: consumer.mobileNumber || '',
                category: consumer.category,
                studentId: consumer.studentId || '',
                remarks: consumer.remarks || '',
                allowance: (consumer.openingBalance || 0).toString(),
            });
        } else {
            setEditingConsumer(null);
            setFormData(EMPTY_FORM);
        }
        // Take to top of page as requested
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setIsModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const valAllowance = parseFloat(allowance) || 0;
        let currentBalance = valAllowance;
        if (editingConsumer) {
            const previouslySpent = editingConsumer.openingBalance - editingConsumer.currentBalance;
            currentBalance = valAllowance - previouslySpent;
        }
        const newConsumer: Consumer = {
            id: editingConsumer ? editingConsumer.id : crypto.randomUUID(),
            name,
            email,
            mobileNumber,
            category,
            studentId: category === 'Student' ? studentId.trim() : null,
            remarks: category === 'Student' ? (remarks.trim() || null) : null,
            openingBalance: valAllowance,
            currentBalance: currentBalance,
            avatar: editingConsumer ? editingConsumer.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
        };
        const submitConsumer = async () => {
            try {
                if (editingConsumer) {
                    await updateConsumer(newConsumer);
                    setConsumerList(prev => prev.map(c => c.id === newConsumer.id ? newConsumer : c));
                    showToast('Consumer updated successfully', 'success');
                } else {
                    await addConsumer(newConsumer);
                    setConsumerList(prev => [...prev, newConsumer]);
                    showToast('Consumer added successfully', 'success');
                }
                setIsModalOpen(false);
                fetchConsumers();
            } catch (error: any) {
                const serverError = error.response?.data?.error || error.message || "Unknown error";
                showToast("Failed to save consumer: " + serverError, 'error');
            }
        };
        submitConsumer();
    }, [editingConsumer, allowance, name, email, mobileNumber, category, studentId, remarks, fetchConsumers, showToast]);

    const handleSettleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settleConsumer || !settleBalance) return;
        setIsSettling(true);
        try {
            const res = await authenticatedFetch(`${API_BASE}/consumers/${settleConsumer.id}/settle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': crypto.randomUUID()
                },
                body: JSON.stringify({
                    paymentAmount: settleBalance,
                    remarks: settleRemarks,
                    paymentMethod: settleMethod,
                    branchId: currentBranch?.id
                })
            });
            if (res.ok) {
                const data = await res.json();
                showToast(`Balance settled. New Balance: ${formatCurrency(data.newBalance)}`, 'success');
                setIsSettleOpen(false);
                // Optimistically update balance in the local list so the table reflects
                // the new balance immediately without waiting for a full refetch.
                setConsumerList(prev => prev.map(c =>
                    c.id === settleConsumer!.id
                        ? { ...c, currentBalance: data.newBalance }
                        : c
                ));
                // Clear transactions client cache so AccountStatementModal shows the
                // new settlement transaction on next open.
                clearCache('transactions');
                fetchConsumers();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to settle balance', 'error');
            }
        } catch (_err) { showToast('Failed to settle balance', 'error'); }
        finally { setIsSettling(false); }
    }, [settleConsumer, settleBalance, settleRemarks, fetchConsumers, settleMethod, currentBranch, showToast]);

    const handleConfirmDelete = async () => {
        if (!consumerToDelete) return;
        try {
            await deleteConsumer(consumerToDelete.id);
            setConsumerList(prev => prev.filter(c => c.id !== consumerToDelete.id));
            setIsDeleteModalOpen(false);
            setConsumerToDelete(null);
            showToast('Consumer deleted successfully', 'success');
        } catch (err: any) {
            showToast("Delete Failed: " + (err.message || "Unknown error"), 'error');
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <PageHeader
                title="Consumer Management"
                subtitle="Manage part-time staff and regular visitors."
                icon={User}
                actions={[
                    { label: "Export", icon: FileSpreadsheet, onClick: () => setIsExportModalOpen(true), variant: 'secondary', hidden: !can('CONSUMER_EXPORT_CSV') },
                    { label: "Email", icon: Mail, onClick: () => setIsEmailModalOpen(true), variant: 'secondary', hidden: !can('STAFF_SEND_NOTIFICATION') },
                    { label: "Add Consumer", icon: Plus, onClick: () => openModal(), variant: 'primary', hidden: !can('CONSUMER_ADD') }
                ]}
            >
                <div className="shrink-0 w-36">
                    <CustomSelect
                        value={statusFilter}
                        onChange={(val: string) => setStatusFilter(val as 'ACTIVE' | 'INACTIVE' | 'ALL')}
                        options={[
                            { value: 'ACTIVE', label: 'Active' },
                            { value: 'INACTIVE', label: 'Inactive' },
                            { value: 'ALL', label: 'All' },
                        ]}
                        searchable={false}
                        placeholder="Filter status"
                    />
                </div>
                <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search consumers..." />
            </PageHeader>

            {selectedConsumerIds.size > 0 && (
                <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">{selectedConsumerIds.size} selected</div>
                        <button onClick={() => setSelectedConsumerIds(new Set())} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Clear selection</button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <ConsumerTable
                    consumers={consumerList}
                    loading={loading}
                    selectedConsumerIds={selectedConsumerIds}
                    onToggleSelectAll={() => setSelectedConsumerIds(prev => prev.size === consumerList.length ? new Set() : new Set(consumerList.map(c => c.id)))}
                    onToggleSelectConsumer={(id) => setSelectedConsumerIds(prev => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id); else next.add(id);
                        return next;
                    })}
                    onOpenStatement={openStatement}
                    onOpenLedger={openLedger}
                    onSettle={(c) => { setSettleConsumer(c); setIsSettleOpen(true); }}
                    onEdit={openModal}
                    onDelete={(c) => { setConsumerToDelete(c); setIsDeleteModalOpen(true); }}
                    onSort={handleSort}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    canEdit={can('CONSUMER_EDIT')}
                    canDelete={can('CONSUMER_DELETE')}
                />
                <Pagination
                    currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage} totalItems={totalItems}
                />
            </div>

            <ExportReportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                exportApiRoute="/consumers/export"
                defaultFileName={`consumer_list_${new Date().toISOString().slice(0, 10)}.xlsx`}
            />

            <ConsumerModal
                isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit}
                editingConsumer={editingConsumer} name={name} setName={setName} email={email} setEmail={setEmail}
                mobileNumber={mobileNumber} setMobileNumber={setMobileNumber} category={category}
                setCategory={setCategory} studentId={studentId} setStudentId={setStudentId}
                remarks={remarks} setRemarks={setRemarks} allowance={allowance} setAllowance={setAllowance}
            />

            <SettleBalanceModal
                isOpen={isSettleOpen} onClose={() => setIsSettleOpen(false)} consumer={settleConsumer}
                settleBalance={settleBalance} setSettleBalance={setSettleBalance}
                settleRemarks={settleRemarks} setSettleRemarks={setSettleRemarks}
                settleMethod={settleMethod} setSettleMethod={setSettleMethod}
                availableMethods={availableMethods}
                targetBranchName={currentBranch?.name}
                onSubmit={handleSettleSubmit} isSettling={isSettling}
            />

            <AccountStatementModal
                isOpen={isStatementOpen} onClose={closeStatement}
                entity={statementEntity} type="CONSUMER" transactions={statementTxns}
                startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}
                onDownloadCSV={downloadStatementCSV} onSendEmail={sendStatementEmail} sendLoading={sendLoading}
                canSendEmail={can('CONSUMER_SEND_STATEMENT')}
                isSendDropdownOpen={isSendDropdownOpen} setIsSendDropdownOpen={setIsSendDropdownOpen}
                showCustomDate={showCustomDate} setShowCustomDate={setShowCustomDate}
                customStartDate={customStartDate} setCustomStartDate={setCustomStartDate}
                customEndDate={customEndDate} setCustomEndDate={setCustomEndDate}
                dropdownRef={sendDropdownRef}
            />
            <SecureActionModal
                isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleConfirmDelete}
                title="Delete Consumer" itemName={consumerToDelete?.name || ''}
                confirmKeyword="DELETE" confirmButtonText="Delete" variant="danger"
            />
            {/* Ledger Audit Modal */}
            <LedgerModal
                isOpen={isLedgerOpen}
                onClose={() => setIsLedgerOpen(false)}
                entityType="CONSUMER"
                entityId={ledgerEntity?.id?.toString() || ''}
                entityName={ledgerEntity?.name || ''}
            />

            <EmailActionModal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                recipientIds={selectedConsumerIds.size > 0 ? Array.from(selectedConsumerIds) : consumerList.map(c => c.id)}
                recipientNames={selectedConsumerIds.size > 0
                    ? consumerList.filter(c => selectedConsumerIds.has(c.id)).map(c => c.name)
                    : consumerList.map(c => c.name)}
                type="CONSUMER"
            />
        </div >
    );
};

export default ConsumerManager;
