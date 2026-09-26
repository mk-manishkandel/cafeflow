import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import { Branch, getBranches, createBranch, updateBranch, deleteBranch } from '../services/storageService';
import { Plus, Store } from 'lucide-react';

import { usePermission } from '../hooks/usePermission';
import { useEntityManager } from '../hooks/useEntityManager';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useBranch } from '../contexts/BranchContext';
import { useUI } from './ui/UIContext';
import { PageHeader } from './shared/PageHeader';
import { SearchInput } from './shared/SearchInput';
import { SecureActionModal } from './shared/SecureActionModal';

// Sub-components
import { BranchModal } from './Managers/Modals/BranchModal';
import { BranchTable } from './Managers/Tables/BranchTable';
import { Button } from './ui/Button';

const BranchManager = ({ showHeader = true }: { showHeader?: boolean }) => {
    const can = usePermission();
    const { currentBranch } = useBranch();
    const { showToast } = useUI();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [_loading, setLoading] = useState(true);

    // Modal Visibility
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Editing State
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const loadBranches = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getBranches();
            setBranches(data);
        } catch (err) {
            logger.error('Failed to load branches', err);
            showToast('Failed to load branches', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBranches();
    }, [loadBranches]);

    // Real-time updates
    useRealTimeUpdate({
        onUpdate: loadBranches,
        dataTypes: ['branch'],
        branchId: currentBranch?.id,
        debounceMs: 2000,
    });

    // Entity Manager
    const {
        searchQuery, setSearchQuery,
        sortedData: filteredBranches
    } = useEntityManager<Branch>({
        data: branches,
        initialSortKey: 'name',
        filterFn: (branch, query) =>
            branch.name.toLowerCase().includes(query) ||
            branch.address.toLowerCase().includes(query),
    });

    const openModal = useCallback((branch?: Branch) => {
        if (branch) {
            setEditingBranch(branch);
            setName(branch.name);
            setAddress(branch.address);
        } else {
            setEditingBranch(null);
            setName('');
            setAddress('');
        }
        setIsModalOpen(true);
    }, []);

    const resetForm = useCallback(() => {
        setName('');
        setAddress('');
        setEditingBranch(null);
        setIsModalOpen(false);
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingBranch) {
                await updateBranch(editingBranch.id, {
                    name,
                    address
                });
                showToast('Branch updated successfully', 'success');
            } else {
                await createBranch({
                    name,
                    address
                });
                showToast('Branch created successfully', 'success');
            }
            await loadBranches();
            resetForm();
        } catch (err) {
            showToast('Operation failed', 'error');
            logger.error(err);
        }
    }, [editingBranch, name, address, loadBranches, resetForm]);

    const handleDeleteClick = useCallback((branch: Branch) => {
        setBranchToDelete(branch);
        setIsDeleteModalOpen(true);
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!branchToDelete) return;
        try {
            await deleteBranch(branchToDelete.id);
            showToast('Branch deleted successfully', 'success');
            await loadBranches();
            setIsDeleteModalOpen(false);
            setBranchToDelete(null);
        } catch (_err) {
            showToast('Failed to delete. Branch might be in use.', 'error');
        }
    }, [branchToDelete, loadBranches]);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {showHeader && (
                <PageHeader
                    title="Branch Management"
                    subtitle="Manage your business locations and branches."
                    icon={Store}
                    actions={[
                        {
                            label: 'Add Branch',
                            icon: Plus,
                            onClick: () => openModal(),
                            hidden: !can('MANAGE_BRANCHES')
                        }
                    ]}
                >
                    <SearchInput
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Search branches..."
                    />
                </PageHeader>
            )}

            {!showHeader && can('MANAGE_BRANCHES') && (
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 mb-6">
                    <div className="flex-1 max-w-md">
                        <SearchInput
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder="Search branches..."
                        />
                    </div>
                    <Button
                        onClick={() => openModal()}
                        leftIcon={<Plus size={16} />}
                        className="px-4 py-2 text-sm"
                    >
                        Add Branch
                    </Button>
                </div>
            )}

            <BranchTable
                branches={filteredBranches}
                searchQuery={searchQuery}
                onEdit={openModal}
                onDelete={handleDeleteClick}
                canManage={can('MANAGE_BRANCHES')}
            />

            <BranchModal
                isOpen={isModalOpen}
                onClose={resetForm}
                onSubmit={handleSubmit}
                editingBranch={editingBranch}
                name={name}
                setName={setName}
                address={address}
                setAddress={setAddress}
            />

            <SecureActionModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Deactivate Branch"
                description="Deactivating a branch will hide it from active operations while preserved historical transaction data. This action is reversible by system administrators."
                itemName={branchToDelete?.name || ''}
                confirmKeyword="DELETE"
                confirmButtonText="Delete"
                variant="danger"
            />
        </div>
    );
};

export default BranchManager;
