import React from 'react';
import { Users } from 'lucide-react';
import { User, Branch } from '../../../types';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { CustomSelect } from '../../shared/CustomSelect';
import { AccessibleModal } from '../../ui/AccessibleModal';

interface UserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    editingUser: User | null;
    username: string;
    setUsername: (val: string) => void;
    password: string;
    setPassword: (val: string) => void;
    role: string;
    setRole: (val: string) => void;
    branchId: string;
    setBranchId: (val: string) => void;
    availableRoles: { name: string }[];
    branches: Branch[];
    error: string;
}

export const UserModal = ({
    isOpen,
    onClose,
    onSubmit,
    editingUser,
    username,
    setUsername,
    password,
    setPassword,
    role,
    setRole,
    branchId,
    setBranchId,
    availableRoles,
    branches,
    error
}: UserModalProps) => {
    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title={editingUser ? 'Edit System User' : 'Create New User'}
            subtitle="User Management"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <Users size={20} />
                </div>
            }
            maxWidth="xl"
            footer={
                <div className="flex gap-3 w-full">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="flex-1 shadow-none hover:bg-slate-100 font-bold"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="user-modal-form"
                        className="flex-1 shadow-lg shadow-indigo-100 font-bold"
                    >
                        {editingUser ? 'Save Changes' : 'Create User'}
                    </Button>
                </div>
            }
        >
            <form id="user-modal-form" onSubmit={onSubmit} className="space-y-6">
                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-[11px] font-black uppercase tracking-widest rounded-2xl flex items-center gap-3">
                        <Users size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="space-y-5">
                    <Input
                        label="Username"
                        required
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="e.g. john_doe"
                        disabled={!!editingUser}
                        className="bg-slate-50/50"
                    />

                    <Input
                        label={editingUser ? 'New Password (leave blank to keep current)' : 'Account Password'}
                        required={!editingUser}
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="bg-slate-50/50"
                    />

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Access Permissions Role</label>
                        <CustomSelect
                            value={role}
                            onChange={setRole}
                            options={availableRoles.map(r => ({ value: r.name, label: r.name }))}
                            placeholder="Select role..."
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Assigned Branch Scope</label>
                        <CustomSelect
                            value={branchId}
                            onChange={setBranchId}
                            options={[
                                { value: '', label: 'Global / All Branches (Administrative)' },
                                ...branches.map(b => ({ value: b.id, label: b.name }))
                            ]}
                            placeholder="Select branch..."
                        />
                        <p className="text-[10px] text-slate-400 px-1 font-bold italic leading-tight">
                            If restricted, this user will only see data belonging to the selected branch.
                        </p>
                    </div>
                </div>
            </form>
        </AccessibleModal>
    );
};
