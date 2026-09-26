import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getInitialsAvatar } from '../utils/avatarUtils';
import { useDebounce } from '../hooks/useDebounce';
import { getStaff, addStaff, updateStaff, deleteStaff, resetAllowances, resetSingleAllowance, API_BASE, authenticatedFetch } from '../services/storageService';
import { Staff } from '../types';
import { isAbortError } from '../services/errors';
import { Plus, Upload, User, RefreshCw, FileSpreadsheet, Mail } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useStatement } from '../hooks/useStatement';
import { useUI } from './ui/UIContext';
import { CustomSelect } from './shared/CustomSelect';
import { Button } from './ui/Button';
import logger from '../utils/logger';

import { PageHeader } from './shared/PageHeader';
import { SearchInput } from './shared/SearchInput';
import Pagination from './Pagination';

// Sub-components
import { StaffModal } from './Managers/Modals/StaffModal';
import { StaffImportModal } from './Managers/Modals/StaffImportModal';
import { AccountStatementModal } from './Managers/Modals/AccountStatementModal';
import { EmailActionModal } from './Managers/Modals/EmailActionModal';
import { StaffTable } from './Managers/Tables/StaffTable';
import { LedgerModal } from './Managers/Modals/LedgerModal';

import { SecureActionModal } from './shared/SecureActionModal';
import { ExportReportModal } from './shared/ExportReportModal';

const StaffManager = () => {
  const can = usePermission();
  const { showToast } = useUI();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Visibility
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [ledgerEntity, setLedgerEntity] = useState<Staff | null>(null);

  // Editing / State
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<Staff | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [staffToReset, setStaffToReset] = useState<Staff | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetAllModalOpen, setIsResetAllModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [allStaffForEmail, setAllStaffForEmail] = useState<Staff[]>([]);

  // Form / Filter State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [allowance, setAllowance] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 15;
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
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
    type: 'STAFF',
    onSuccess: (msg) => showToast(msg, 'success'),
    onError: (err) => showToast(err, 'error')
  });

  // Fetch Staff
  const fetchStaff = useCallback(async (isBackground = false, signal?: AbortSignal) => {
    if (!isBackground) setLoading(true);
    try {
      const result = await getStaff(currentPage, itemsPerPage, searchQuery, sortKey, sortDir, statusFilter, signal);
      if (Array.isArray(result)) {
        setStaffList(result);
        setTotalPages(1);
        setTotalItems(result.length);
      } else {
        setStaffList(result.data);
        setTotalPages(result.pagination.totalPages);
        setTotalItems(result.pagination.total);
      }
    } catch (err) {
      // A cancelled request (superseded by a newer filter/page change) is not a failure.
      if (isAbortError(err)) return;
      logger.error('Failed to fetch staff', err);
      showToast('Failed to load staff', 'error');
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [showToast, currentPage, debouncedSearchQuery, sortKey, sortDir, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchStaff(false, controller.signal);
    return () => controller.abort();
  }, [fetchStaff]);

  // Reset page on search/sort/filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, sortKey, sortDir, statusFilter]);

  // Real-time updates
  useRealTimeUpdate({
    onUpdate: () => fetchStaff(true),
    dataTypes: ['staff', 'transaction'],
    debounceMs: 2000,
  });

  const openModal = useCallback((staff?: Staff) => {
    if (staff) {
      setEditingStaff(staff);
      setName(staff.name);
      setEmail(staff.email);
      setMobileNumber(staff.mobileNumber || '');
      setDepartment(staff.department);
      setAllowance(staff.monthlyAllowance.toString());
      setStatus(staff.status || 'ACTIVE');
    } else {
      setEditingStaff(null);
      setName('');
      setEmail('');
      setMobileNumber('');
      setDepartment('');
      setAllowance('');
      setStatus('ACTIVE');
    }
    // Take to top of page as requested
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsModalOpen(true);
  }, []);

  const openLedgerModal = useCallback((staff: Staff) => {
    setLedgerEntity(staff);
    setIsLedgerModalOpen(true);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const valAllowance = parseFloat(allowance) || 0;
    let currentBalance = valAllowance;
    if (editingStaff) {
      const previouslySpent = editingStaff.monthlyAllowance - editingStaff.currentBalance;
      currentBalance = valAllowance - previouslySpent;
    }
    const newStaff: Staff = {
      id: editingStaff ? editingStaff.id : crypto.randomUUID(),
      name,
      email,
      mobileNumber,
      department,
      monthlyAllowance: valAllowance,
      currentBalance: currentBalance,
      avatar: editingStaff ? editingStaff.avatar : getInitialsAvatar(name),
      status: status as 'ACTIVE' | 'INACTIVE'
    };
    const submitStaff = async () => {
      try {
        if (editingStaff) {
          await updateStaff(newStaff);
          showToast('Staff updated successfully', 'success');
          // Refetch to ensure UI reflects database state
          await fetchStaff();
        } else {
          await addStaff(newStaff);
          showToast('Staff created successfully', 'success');
          // Refetch to get the newly created staff with server-generated fields
          await fetchStaff();
        }
        setIsModalOpen(false);
      } catch (error: any) {
        const serverError = error.response?.data?.error || error.message || "Unknown error";
        showToast("Failed to save staff: " + serverError, 'error');
      }
    };
    submitStaff();
  }, [editingStaff, allowance, name, email, mobileNumber, department, status, fetchStaff, showToast]);

  const handleConfirmDelete = async () => {
    if (!staffToDelete) return;
    try {
      await deleteStaff(staffToDelete.id);
      setStaffList(prev => prev.filter(s => s.id !== staffToDelete.id));
      setIsDeleteModalOpen(false);
      setStaffToDelete(null);
      showToast('Staff deleted successfully', 'success');
    } catch (err: any) {
      showToast("Delete Failed: " + (err.message || "Unknown error"), 'error');
    }
  };



  const handleConfirmReset = async () => {
    if (!staffToReset) return;
    try {
      await resetSingleAllowance(staffToReset.id);
      setIsResetModalOpen(false);
      setStaffToReset(null);
      // Refetch to get the authoritative balance from DB
      await fetchStaff();
      showToast('Allowance reset successfully', 'success');
    } catch (err: any) {
      showToast("Reset Failed: " + (err.message || "Unknown error"), 'error');
    }
  };

  const handleConfirmResetAll = async () => {
    try {
      const updatedList = await resetAllowances();
      setStaffList(updatedList);
      setIsResetAllModalOpen(false);
      showToast('All allowances reset successfully.', 'success');
    } catch (err: any) {
      showToast("Reset Failed: " + (err.message || "Unknown error"), 'error');
    }
  };

  const handleImportCSV = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/).filter(l => l.trim());

      if (lines.length === 0) {
        showToast("The uploaded file is empty.", 'error');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = ['name', 'email', 'department']; // Basic requirement
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

      // Check for at least one mobile and allowance variant
      const hasMobile = headers.includes('mobilenumber') || headers.includes('mobile');
      const hasAllowance = headers.includes('monthlyallowance') || headers.includes('allowance');

      if (missingHeaders.length > 0 || !hasMobile || !hasAllowance) {
        let errorMsg = "Invalid CSV format.";
        if (missingHeaders.length > 0) errorMsg += ` Missing columns: ${missingHeaders.join(', ')}.`;
        if (!hasMobile) errorMsg += ` Missing 'mobile' or 'mobileNumber' column.`;
        if (!hasAllowance) errorMsg += ` Missing 'monthlyAllowance' or 'allowance' column.`;
        showToast(errorMsg + "\nPlease download the template to ensure correct format.", 'error');
        return;
      }

      const list = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        if (values.length <= 1 && !values[0]) return null;

        return {
          name: values[headers.indexOf('name')] || '',
          email: values[headers.indexOf('email')] || '',
          mobileNumber: values[headers.indexOf('mobilenumber')] || values[headers.indexOf('mobile')] || '',
          department: values[headers.indexOf('department')] || '',
          monthlyAllowance: parseFloat(values[headers.indexOf('monthlyallowance')] || values[headers.indexOf('allowance')] || '0')
        };
      }).filter((s): s is any => !!(s && s.name && s.email));

      if (list.length === 0) {
        showToast("No valid staff records found in the file. Please check your data.", 'error');
        return;
      }

      const response = await authenticatedFetch(API_BASE + '/staff/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ staffList: list })
      });
      if (response.ok) {
        const result = await response.json();
        showToast('Import complete!\nCreated: ' + result.created + '\nUpdated: ' + result.updated, 'success');
        fetchStaff();
      } else {
        let errMsg = 'Unknown error';
        try { const res = await response.json(); errMsg = res.error || errMsg; } catch (_) {}
        showToast('Import failed: ' + errMsg, 'error');
      }
    } catch (err: any) { showToast('Import failed: ' + err.message, 'error'); }
    finally {
      setIsImporting(false);
      setIsImportModalOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [fetchStaff]);

  // Deprecated client-side export staff to csv removed

  // Nepali months logic removed as it is now inside the generic EmailActionModal parameters if needed

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Staff Management"
        subtitle="Manage employee allowances and access."
        icon={User}
        actions={[
          { label: "Import", icon: Upload, onClick: () => setIsImportModalOpen(true), disabled: isImporting, variant: 'secondary', hidden: !can('STAFF_BULK_IMPORT') },
          { label: "Export", icon: FileSpreadsheet, onClick: () => setIsExportModalOpen(true), variant: 'secondary', hidden: !can('EXPORT_REPORTS') },
          { label: "Email", icon: Mail, onClick: async () => {
              if (selectedStaffIds.size === 0) {
                const all = await getStaff();
                setAllStaffForEmail(Array.isArray(all) ? all : (all as any).data ?? []);
              }
              setIsEmailModalOpen(true);
            }, variant: 'secondary', hidden: !can('STAFF_SEND_NOTIFICATION') },
          { label: "Add Staff", icon: Plus, onClick: () => openModal(), variant: 'primary', hidden: !can('STAFF_ADD') },
          { label: "Reset All", icon: RefreshCw, onClick: () => setIsResetAllModalOpen(true), variant: 'danger', hidden: !can('STAFF_RESET') }
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
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search staff..." />
      </PageHeader>

      {selectedStaffIds.size > 0 && (
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">{selectedStaffIds.size} selected</div>
            <Button variant="ghost" onClick={() => setSelectedStaffIds(new Set())} className="!p-0 text-sm text-indigo-600 hover:text-indigo-800 hover:bg-transparent font-medium shadow-none">Clear selection</Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <StaffTable
          loading={loading}
          staff={staffList}
          selectedStaffIds={selectedStaffIds}
          totalItems={totalItems}
          onToggleSelectAll={async () => {
            if (selectedStaffIds.size === totalItems) {
              setSelectedStaffIds(new Set());
            } else {
              const all = await getStaff();
              const allList: Staff[] = Array.isArray(all) ? all : (all as any).data ?? [];
              setAllStaffForEmail(allList);
              setSelectedStaffIds(new Set(allList.map(s => s.id)));
            }
          }}
          onToggleSelectStaff={(id) => setSelectedStaffIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onSort={handleSort} sortKey={sortKey} sortDir={sortDir}
          onOpenStatement={openStatement}
          onOpenLedger={openLedgerModal}
          onEdit={openModal}
          onReset={(s) => { setStaffToReset(s); setIsResetModalOpen(true); }}
          onDelete={(id) => {
            const s = staffList.find(item => item.id === id);
            if (s) {
              setStaffToDelete(s);
              setIsDeleteModalOpen(true);
            }
          }}
          canEdit={can('STAFF_EDIT')} canReset={can('STAFF_RESET')} canDelete={can('STAFF_DELETE')}
        />
        <Pagination
          currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage} totalItems={totalItems}
        />
      </div>

      <StaffModal
        isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit}
        editingStaff={editingStaff} name={name} setName={setName} email={email} setEmail={setEmail}
        mobileNumber={mobileNumber} setMobileNumber={setMobileNumber} department={department}
        setDepartment={setDepartment} allowance={allowance} setAllowance={setAllowance}
        status={status} setStatus={setStatus}
      />

      <StaffImportModal
        isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)}
        onDownloadTemplate={() => {
          const blob = new Blob(['name,email,mobileNumber,department,monthlyAllowance\nJohn Doe,john@example.com,+919876543210,Engineering,5000'], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'staff_import_template.csv'; a.click();
        }}
        onUploadClick={() => fileInputRef.current?.click()}
        isImporting={isImporting}
      />
      <input type="file" ref={fileInputRef} onChange={handleImportCSV} className="hidden" accept=".csv" />

      <AccountStatementModal
        isOpen={isStatementOpen} onClose={closeStatement}
        entity={statementEntity} type="STAFF" transactions={statementTxns}
        startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}
        onDownloadCSV={downloadStatementCSV} onSendEmail={sendStatementEmail} sendLoading={sendLoading}
        canSendEmail={can('STAFF_SEND_STATEMENT')}
        isSendDropdownOpen={isSendDropdownOpen} setIsSendDropdownOpen={setIsSendDropdownOpen}
        showCustomDate={showCustomDate} setShowCustomDate={setShowCustomDate}
        customStartDate={customStartDate} setCustomStartDate={setCustomStartDate}
        customEndDate={customEndDate} setCustomEndDate={setCustomEndDate}
        dropdownRef={sendDropdownRef}
      />

      <EmailActionModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        recipientIds={selectedStaffIds.size > 0 ? Array.from(selectedStaffIds) : allStaffForEmail.map(s => s.id)}
        recipientNames={selectedStaffIds.size > 0
          ? staffList.filter(s => selectedStaffIds.has(s.id)).map(s => s.name)
          : allStaffForEmail.map(s => s.name)}
        type="STAFF"
      />

      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        exportApiRoute="/staff/export"
        defaultFileName="staff_list"
      />
      <SecureActionModal
        isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleConfirmDelete}
        title="Delete Staff Member" itemName={staffToDelete?.name || ''}
        confirmKeyword="DELETE" confirmButtonText="Delete" variant="danger"
      />
      <SecureActionModal
        isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} onConfirm={handleConfirmReset}
        title="Reset Allowance" description="This will reset the current balance to the full monthly allowance. Current balance will be lost."
        itemName={staffToReset?.name || ''} confirmKeyword="RESET" confirmButtonText="Reset Allowance" variant="warning"
      />
      <SecureActionModal
        isOpen={isResetAllModalOpen} onClose={() => setIsResetAllModalOpen(false)} onConfirm={handleConfirmResetAll}
        title="Reset All Allowances" description="WARNING: This will reset the balance for EVERY staff member to their full monthly allowance. Current balances will be lost. This cannot be undone."
        itemName="ALL Staff Members" confirmKeyword="RESET" confirmButtonText="Reset ALL" variant="danger"
      />
      {/* Ledger Audit Modal */}
      <LedgerModal
        isOpen={isLedgerModalOpen}
        onClose={() => setIsLedgerModalOpen(false)}
        entityType="STAFF"
        entityId={ledgerEntity?.id?.toString() || ''}
        entityName={ledgerEntity?.name || ''}
      />
    </div>
  );
};

export default StaffManager;