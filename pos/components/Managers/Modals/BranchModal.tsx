import React from 'react';
import { Store, Save } from 'lucide-react';
import { Branch } from '../../../types';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AccessibleModal } from '../../ui/AccessibleModal';

interface BranchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    editingBranch: Branch | null;
    name: string;
    setName: (val: string) => void;
    address: string;
    setAddress: (val: string) => void;
}

export const BranchModal = ({
    isOpen,
    onClose,
    onSubmit,
    editingBranch,
    name,
    setName,
    address,
    setAddress
}: BranchModalProps) => {
    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title={editingBranch ? 'Edit Branch' : 'New Branch'}
            subtitle="Business Setup"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <Store size={20} />
                </div>
            }
            maxWidth="xl"
            footer={
                <div className="flex justify-end gap-3">
                    <Button
                        variant="ghost"
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 font-bold hover:bg-slate-100 shadow-none !text-slate-600"
                    >
                        Cancel
                    </Button>
                    <Button
                        form="branch-form"
                        type="submit"
                        leftIcon={<Save size={20} />}
                        className="px-8 py-3 font-bold !active:scale-95"
                    >
                        {editingBranch ? 'Update Branch' : 'Create Branch'}
                    </Button>
                </div>
            }
        >
            <form id="branch-form" onSubmit={onSubmit} className="space-y-5">
                <Input
                    label="Branch Name"
                    required
                    value={name}
                    onChange={(e: any) => setName(e.target.value)}
                    placeholder="e.g. Main Campus"
                />

                <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase text-slate-400 ml-1 tracking-widest">Address <span className="text-red-500">*</span></label>
                    <textarea
                        required
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none transition-all h-24 resize-none placeholder:text-slate-400 text-sm font-bold"
                        placeholder="Street address..."
                    />
                </div>
            </form>
        </AccessibleModal>
    );
};
