import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Shield, Save, Key, Plus } from 'lucide-react';
import { getRoles, createRole, updateRole, deleteRole } from '../services/storageService';
import { PageHeader } from './shared/PageHeader';
import { SearchInput } from './shared/SearchInput';
import { useRealTimeUpdate } from '../hooks/useRealTimeUpdate';
import { useBranch } from '../contexts/BranchContext';
import { PERMISSION_GROUPS, ALL_PERMISSIONS } from '../constants/permissions';
import { useUI } from './ui/UIContext';
import { CreateRoleModal } from './Managers/Modals/CreateRoleModal';
import logger from '../utils/logger';
import { DeleteRoleModal } from './Managers/Modals/DeleteRoleModal';
import { Button } from './ui/Button';

// Sub-components
import { RoleSidebar } from './Managers/Sidebars/RoleSidebar';
import { PermissionGrid } from './Managers/Permissions/PermissionGrid';

interface Role {
    name: string;
    permissions: string[];
}

const RoleManager = () => {
    const { currentBranch } = useBranch();
    const { showToast, confirm } = useUI();
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<string[]>(PERMISSION_GROUPS.map(g => g.name));
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);
    const [roleToDelete, setRoleToDelete] = useState<string | null>(null);

    const fetchRoles = useCallback(async (force = false) => {
        if (hasUnsavedChanges && !force) return;

        try {
            const data = await getRoles();
            setRoles(data);
            if (data.length > 0 && !selectedRole) {
                setSelectedRole(data[0].name);
            }
        } catch (err) {
            logger.error('Failed to load roles', err);
            showToast('Failed to load roles', 'error');
        }
    }, [selectedRole, hasUnsavedChanges, showToast]);

    useEffect(() => {
        fetchRoles(true);
    }, []);

    useRealTimeUpdate({
        onUpdate: () => fetchRoles(false),
        dataTypes: ['role'],
        branchId: currentBranch?.id,
        debounceMs: 2000,
    });

    const togglePermission = useCallback((roleName: string, permId: string) => {
        setHasUnsavedChanges(true);
        setRoles(prevRoles => prevRoles.map(r => {
            if (r.name === roleName) {
                const hasPerm = r.permissions.includes(permId);
                const newPerms = hasPerm
                    ? r.permissions.filter(p => p !== permId)
                    : [...r.permissions, permId];
                return { ...r, permissions: newPerms };
            }
            return r;
        }));
    }, []);

    const handleSave = useCallback(async (roleName: string) => {
        if (!await confirm({
            title: 'Update Permissions',
            description: `Are you sure you want to update permissions for ${roleName}?`,
            confirmText: 'Update'
        })) {
            return;
        }
        setLoading(true);
        try {
            const role = roles.find(r => r.name === roleName);
            if (!role) return;

            await updateRole(roleName, role.permissions);
            showToast(`Saved permissions for ${roleName}`, 'success');
            setHasUnsavedChanges(false);
        } catch (err: any) {
            showToast('Error: ' + (err.message || 'Unknown'), 'error');
        } finally {
            setLoading(false);
        }
    }, [roles, confirm, showToast]);

    const handleCreateRole = useCallback(async () => {
        if (!newRoleName.trim()) return;
        setLoading(true);
        try {
            await createRole({ name: newRoleName.trim(), permissions: newRolePermissions });
            showToast(`Created role: ${newRoleName}`, 'success');
            setShowCreateModal(false);
            setNewRoleName('');
            setNewRolePermissions([]);
            fetchRoles(true);
        } catch (err: any) {
            showToast('Error: ' + (err.message || 'Unknown'), 'error');
        } finally {
            setLoading(false);
        }
    }, [newRoleName, newRolePermissions, fetchRoles, showToast]);

    const handleDeleteRole = useCallback(async (roleName: string) => {
        setLoading(true);
        try {
            await deleteRole(roleName);
            showToast(`Deleted role: ${roleName}`, 'success');
            setRoleToDelete(null);
            if (selectedRole === roleName) setSelectedRole(null);
            fetchRoles(true);
        } catch (err: any) {
            showToast('Error: ' + (err.message || 'Unknown'), 'error');
        } finally {
            setLoading(false);
        }
    }, [fetchRoles, selectedRole, showToast]);

    const toggleNewRolePermission = useCallback((permId: string) => {
        setNewRolePermissions(prev =>
            prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
        );
    }, []);

    const toggleGroup = useCallback((groupName: string) => {
        setExpandedGroups(prev =>
            prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName]
        );
    }, []);

    const toggleAllGroupPermissions = useCallback((roleName: string, groupPerms: string[], currentlyActive: number) => {
        setHasUnsavedChanges(true);
        setRoles(prevRoles => prevRoles.map(r => {
            if (r.name === roleName) {
                if (currentlyActive === groupPerms.length) {
                    return { ...r, permissions: r.permissions.filter(p => !groupPerms.includes(p)) };
                } else {
                    const newPerms = [...new Set([...r.permissions, ...groupPerms])];
                    return { ...r, permissions: newPerms };
                }
            }
            return r;
        }));
    }, []);

    const currentRole = useMemo(() => roles.find(r => r.name === selectedRole), [roles, selectedRole]);

    const filteredGroups = useMemo(() => {
        if (!searchQuery) return PERMISSION_GROUPS;
        const q = searchQuery.toLowerCase();
        return PERMISSION_GROUPS.map(group => ({
            ...group,
            permissions: group.permissions.filter(p =>
                p.label.toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q)
            )
        })).filter(group => group.permissions.length > 0);
    }, [searchQuery]);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <PageHeader
                title="Role Permissions"
                subtitle="Configure access levels and permissions per role"
                icon={Shield}
                actions={[
                    {
                        label: 'Create Role',
                        icon: Plus,
                        onClick: () => {
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                            setShowCreateModal(true);
                        },
                        variant: 'primary'
                    }
                ]}
            >
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search permissions..."
                />
            </PageHeader>

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 xl:col-span-3">
                    <RoleSidebar
                        roles={roles}
                        selectedRole={selectedRole}
                        onSelectRole={setSelectedRole}
                        onDeleteRole={setRoleToDelete}
                    />
                </div>

                {/* Permission Editor */}
                <div className="lg:col-span-8 xl:col-span-9">
                    {currentRole ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            {/* Role Header */}
                            <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 sm:gap-4">
                                        <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-100 shrink-0">
                                            <Key className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <h2 className="text-lg font-bold text-slate-900 truncate">{currentRole.name}</h2>
                                            <p className="text-xs sm:text-sm text-slate-500">
                                                {currentRole.permissions.filter(p => ALL_PERMISSIONS.includes(p)).length} of {ALL_PERMISSIONS.length} permissions enabled
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => handleSave(currentRole.name)}
                                        disabled={loading}
                                        isLoading={loading}
                                        className="w-full sm:w-auto px-5 py-2.5 shadow-lg shadow-indigo-200"
                                        leftIcon={!loading && <Save size={16} />}
                                    >
                                        Save Changes
                                    </Button>
                                </div>
                            </div>

                            <PermissionGrid
                                filteredGroups={filteredGroups}
                                expandedGroups={expandedGroups}
                                currentRole={currentRole as any}
                                onToggleGroup={toggleGroup}
                                onTogglePermission={togglePermission}
                                onToggleAllGroupPermissions={toggleAllGroupPermissions}
                                searchQuery={searchQuery}
                            />
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                            <Shield className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-slate-800 mb-2">Select a Role</h3>
                            <p className="text-slate-500">Choose a role from the sidebar to manage its permissions</p>
                        </div>
                    )}
                </div>
            </div>

            <CreateRoleModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSubmit={handleCreateRole}
                loading={loading}
                newRoleName={newRoleName}
                setNewRoleName={setNewRoleName}
                newRolePermissions={newRolePermissions}
                toggleNewRolePermission={toggleNewRolePermission}
            />

            <DeleteRoleModal
                roleName={roleToDelete}
                onClose={() => setRoleToDelete(null)}
                onConfirm={handleDeleteRole}
                loading={loading}
            />
        </div >
    );
};

export default RoleManager;
