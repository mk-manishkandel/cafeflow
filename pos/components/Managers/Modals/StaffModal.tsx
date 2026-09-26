import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { Staff } from '../../../types';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AccessibleModal } from '../../ui/AccessibleModal';
import { CustomSelect } from '../../shared/CustomSelect';

import { CURRENCY_SYMBOL } from '../../../utils/currency';
interface StaffModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    editingStaff: Staff | null;
    name: string;
    setName: (val: string) => void;
    email: string;
    setEmail: (val: string) => void;
    mobileNumber: string;
    setMobileNumber: (val: string) => void;
    department: string;
    setDepartment: (val: string) => void;
    allowance: string;
    setAllowance: (val: string) => void;
    status: string;
    setStatus: (val: string) => void;
}

export const StaffModal = ({
    isOpen,
    onClose,
    onSubmit,
    editingStaff,
    name,
    setName,
    email,
    setEmail,
    mobileNumber,
    setMobileNumber,
    department,
    setDepartment,
    allowance,
    setAllowance,
    status,
    setStatus
}: StaffModalProps) => {
    const [isDirty, setIsDirty] = useState(false);

    // Reset dirty state when modal opens/closes
    useEffect(() => {
        if (isOpen) setIsDirty(false);
    }, [isOpen]);

    const markDirty = () => setIsDirty(true);

    const handleClose = () => {
        if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
        onClose();
    };

    const handleSubmit = (e: React.FormEvent) => {
        setIsDirty(false);
        onSubmit(e);
    };

    const statusOptions = [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Inactive' }
    ];
    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={handleClose}
            title={editingStaff ? 'Edit Staff Member' : 'Add New Staff'}
            subtitle="Staff Management"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <User size={20} />
                </div>
            }
            maxWidth="xl"
            footer={
                <div className="flex justify-end gap-3 w-full">
                    <Button variant="secondary" type="button" onClick={handleClose} className="shadow-none">Cancel</Button>
                    <Button form="staff-form" type="submit">Save Staff</Button>
                </div>
            }
        >
            <form id="staff-form" onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Full Name"
                    required
                    type="text"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); markDirty(); }}
                    placeholder="e.g. John Doe"
                    className="bg-slate-50/50"
                />
                <Input
                    label="Email Address"
                    required
                    type="email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); markDirty(); }}
                    placeholder="john@example.com"
                    className="bg-slate-50/50"
                />
                <Input
                    label="Mobile Number"
                    required
                    type="tel"
                    value={mobileNumber}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setMobileNumber(e.target.value); markDirty(); }}
                    placeholder="+91..."
                    className="bg-slate-50/50"
                />
                <Input
                    label="Department"
                    required
                    type="text"
                    value={department}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setDepartment(e.target.value); markDirty(); }}
                    placeholder="e.g. Engineering"
                    className="bg-slate-50/50"
                />
                <Input
                    label={`Monthly Allowance (${CURRENCY_SYMBOL})`}
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={allowance}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAllowance(e.target.value); markDirty(); }}
                    placeholder="0.00"
                    leftIcon={<span className="text-xs font-black">{CURRENCY_SYMBOL}</span>}
                    className="bg-slate-50/50"
                />
                {editingStaff && (
                    <CustomSelect
                        label="Status"
                        required
                        value={status}
                        onChange={(val) => { setStatus(val); markDirty(); }}
                        options={statusOptions}
                        placeholder="Select status..."
                    />
                )}
            </form>
        </AccessibleModal>
    );
};
