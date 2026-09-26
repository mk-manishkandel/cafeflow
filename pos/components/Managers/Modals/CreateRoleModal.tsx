import React from 'react';
import { Plus } from 'lucide-react';
import { PERMISSION_GROUPS } from '../../../constants/permissions';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AccessibleModal } from '../../ui/AccessibleModal';

interface CreateRoleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    loading: boolean;
    newRoleName: string;
    setNewRoleName: (name: string) => void;
    newRolePermissions: string[];
    toggleNewRolePermission: (permId: string) => void;
}

export const CreateRoleModal = ({
    isOpen,
    onClose,
    onSubmit,
    loading,
    newRoleName,
    setNewRoleName,
    newRolePermissions,
    toggleNewRolePermission
}: CreateRoleModalProps) => {
    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title="Create New Role"
            subtitle="Role Management"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <Plus size={20} />
                </div>
            }
            maxWidth="2xl"
            footer={
                <div className="flex justify-between items-center w-full">
                    <span className="text-sm text-slate-500">
                        {newRolePermissions.length} permissions selected
                    </span>
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={onSubmit}
                            disabled={loading || !newRoleName.trim()}
                            isLoading={loading}
                            className="shadow-lg shadow-indigo-200"
                            leftIcon={!loading && <Plus size={16} />}
                        >
                            Create Role
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-5">
                <Input
                    label="Role Name"
                    required
                    type="text"
                    value={newRoleName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRoleName(e.target.value)}
                    placeholder="e.g. Supervisor, Cashier, Viewer..."
                />

                <div className="space-y-3">
                    <label className="text-xs font-black uppercase text-slate-400 ml-1 tracking-widest">Initial Permissions</label>
                    <div className="space-y-3">
                        {PERMISSION_GROUPS.map(group => {
                            const Icon = group.icon;
                            return (
                                <div key={group.name} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                                        <Icon size={14} className="text-slate-500" />
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{group.name}</h4>
                                    </div>
                                    <div className="p-3 grid grid-cols-2 gap-2">
                                        {group.permissions.map(perm => (
                                            <label key={perm.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group">
                                                <input
                                                    type="checkbox"
                                                    checked={newRolePermissions.includes(perm.id)}
                                                    onChange={() => toggleNewRolePermission(perm.id)}
                                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 transition-all"
                                                />
                                                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900">{perm.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </AccessibleModal>
    );
};
