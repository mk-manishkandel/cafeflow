import { Transaction, Staff } from '../../../types';
import { CustomSelect } from '../../shared/CustomSelect';
import React from 'react';
import { AlertTriangle, User } from 'lucide-react';
import { AccessibleModal } from '../../ui/AccessibleModal';

import { formatCurrency } from '../../../utils/currency';
interface ChangeStaffModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    selectedTxn: Transaction | null;
    newStaffId: string;
    setNewStaffId: (id: string) => void;
    staffList: Staff[];
}

export const ChangeStaffModal = ({
    isOpen,
    onClose,
    onSubmit,
    selectedTxn,
    newStaffId,
    setNewStaffId,
    staffList
}: ChangeStaffModalProps) => {
    if (!selectedTxn && isOpen) return null;

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title="Correction: Change Staff"
            subtitle="Admin Controls"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center text-white shadow-lg shadow-amber-100">
                    <User size={20} />
                </div>
            }
            maxWidth="lg"
            footer={
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button
                        form="change-staff-form"
                        type="submit"
                        disabled={!newStaffId || newStaffId === selectedTxn?.staffId}
                        className="px-8 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transform active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                    >
                        Confirm Change
                    </button>
                </div>
            }
        >
            <form id="change-staff-form" onSubmit={onSubmit} className="space-y-6">
                {selectedTxn && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-4 items-start shadow-sm">
                        <AlertTriangle className="text-amber-600 shrink-0" size={20} />
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">Critical Operation</p>
                            <p className="text-xs text-amber-800 leading-relaxed">
                                This will refund <span className="font-bold underlineDecoration-indigo-500">{selectedTxn.staffName}</span> and charge the new individual <span className="font-bold">{formatCurrency(selectedTxn.totalAmount)}</span>.
                            </p>
                        </div>
                    </div>
                )}

                <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase text-slate-400 ml-1 tracking-widest">Assign to New Individual</label>
                    <CustomSelect
                        value={newStaffId}
                        onChange={setNewStaffId}
                        placeholder="Select Individual..."
                        options={staffList.map(s => ({
                            value: s.id,
                            label: `${s.name} (${s.department || 'N/A'})`
                        }))}
                    />
                </div>
            </form>
        </AccessibleModal>
    );
};
