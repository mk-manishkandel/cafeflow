import React, { useState, useEffect, useCallback } from 'react';
import { getUsers, createUser, updateUser, deleteUser, getBranches, getRoles, Branch } from '../services/storageService';
import { User } from '../types';
import { Plus, Users as UsersIcon } from 'lucide-react';
import Pagination from './Pagination';

import { usePermission } from '../hooks/usePermission';
import { useEntityManager } from '../hooks/useEntityManager';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useBranch } from '../contexts/BranchContext';
import { useUI } from './ui/UIContext';
import { PageHeader } from './shared/PageHeader';
import logger from '../utils/logger';
import { SearchInput } from './shared/SearchInput';
import { SecureActionModal } from './shared/SecureActionModal';

// Sub-components
import { UserModal } from './Managers/Modals/UserModal';
import { UserTable } from './Managers/Tables/UserTable';

const UserManager = () => {
    const can = usePermission();
    const { currentBranch } = useBranch();
    const { showToast } = useUI();
    const [users, setUsers] = useState<User[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [availableRoles, setAvailableRoles] = useState<{ name: string }[]>([]);
    const [_loading, setLoading] = useState(true);

    // Modal Visibility
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Editing State
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);

    // Form State
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<string>('staff');
    const [branchId, setBranchId] = useState('');
    const [error, setError] = useState('');

    const loadData = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        try {
            const [userData, branchData, roleData] = await Promise.all([getUsers(), getBranches(), getRoles()]);
            setUsers(userData);
            setBranches(branchData);
            setAvailableRoles(roleData);
        } catch (err: any) {
            logger.error('Failed to load data', err);
            setError(err?.message || 'Failed to load users');
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Real-time updates
    useRealTimeUpdate({
        onUpdate: () => loadData(true),
        dataTypes: ['user', 'role'],
        branchId: currentBranch?.id,
        debounceMs: 2000,
    });

    // Entity Manager
    const {
        searchQuery, setSearchQuery,
        currentPage, setCurrentPage,
        isShowingAll, handleShowAll,
        sortKey, sortDir, handleSort,
        paginatedData: paginatedUsers,
        totalPages,
        totalItems,
        itemsPerPage
    } = useEntityManager<User>({
        data: users,
        initialSortKey: 'username',
        filterFn: (user, query) =>
            user.username.toLowerCase().includes(query) ||
            user.role.toLowerCase().includes(query),
    });

    const handleOpenModal = useCallback((user?: User) => {
        setError('');
        if (user) {
            setEditingUser(user);
            setUsername(user.username);
            setRole(user.role);
            setBranchId(user.branchId || '');
            setPassword('');
        } else {
            setEditingUser(null);
            setUsername('');
            setPassword('');
            setRole('staff');
            setBranchId('');
        }
        // Take to top of page as requested
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setIsModalOpen(true);
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            if (editingUser) {
                const updates: any = { role, branchId: branchId || null };
                if (password) updates.password = password;
                await updateUser(editingUser.id, updates);
                showToast('User updated successfully', 'success');
            } else {
                if (!password) {
                    setError('Password is required for new users');
                    return;
                }
                await createUser({ username, password, role: role as any, branchId: branchId || null });
                showToast('User created successfully', 'success');
            }
            setIsModalOpen(false);
            loadData();
        } catch (err: any) {
            if (err.message) setError(err.message);
            else setError('Operation failed');
        }
    }, [editingUser, role, branchId, password, username, loadData]);

    const handleDeleteClick = useCallback((user: User) => {
        setUserToDelete(user);
        setIsDeleteModalOpen(true);
    }, []);

    const handleToggleActive = useCallback(async (user: User) => {
        const disabling = user.isActive !== false;
        if (disabling && !window.confirm(`Disable ${user.username}? This immediately cuts off their access.`)) return;
        try {
            await updateUser(user.id, { isActive: !disabling });
            showToast(disabling ? 'User disabled' : 'User enabled', 'success');
            loadData();
        } catch (err: any) {
            showToast(err.message || 'Failed to update user status', 'error');
        }
    }, [loadData, showToast]);

    const handleConfirmDelete = useCallback(async () => {
        if (!userToDelete) return;
        try {
            await deleteUser(userToDelete.id);
            showToast('User deleted successfully', 'success');
            setIsDeleteModalOpen(false);
            setUserToDelete(null);
            loadData();
        } catch (err: any) {
            showToast("Delete Failed: " + (err.message || "Unknown error"), 'error');
        }
    }, [userToDelete, loadData]);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <PageHeader
                title="User Management"
                subtitle="Manage system access and roles"
                icon={UsersIcon}
                actions={[
                    {
                        label: 'Add User',
                        icon: Plus,
                        onClick: () => handleOpenModal(),
                        hidden: !can('MANAGE_USERS')
                    }
                ]}
            >
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search users..."
                />
            </PageHeader>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <UserTable
                    users={paginatedUsers}
                    onSort={handleSort}
                    sortKey={sortKey as string}
                    sortDir={sortDir}
                    onEdit={handleOpenModal}
                    onDelete={handleDeleteClick}
                    onToggleActive={handleToggleActive}
                    canManage={can('MANAGE_USERS')}
                    searchQuery={searchQuery}
                />
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={totalItems}
                    onShowAll={handleShowAll}
                    isShowingAll={isShowingAll}
                />
            </div>

            <UserModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                editingUser={editingUser}
                username={username}
                setUsername={setUsername}
                password={password}
                setPassword={setPassword}
                role={role}
                setRole={setRole}
                branchId={branchId}
                setBranchId={setBranchId}
                availableRoles={availableRoles}
                branches={branches}
                error={error}
            />

            <SecureActionModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Delete User"
                description="This will permanently delete this user account. This action cannot be undone."
                itemName={userToDelete?.username || ''}
                confirmKeyword="DELETE"
                confirmButtonText="Delete"
                variant="danger"
            />
        </div>
    );
};

export default UserManager;
