import React, { useState, useEffect } from 'react';
import { User, Tag } from 'lucide-react';
import { CustomSelect } from '../../shared/CustomSelect';
import { Consumer } from '../../../types';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AccessibleModal } from '../../ui/AccessibleModal';

import { CURRENCY_SYMBOL } from '../../../utils/currency';
interface ConsumerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    editingConsumer: Consumer | null;
    name: string;
    setName: (val: string) => void;
    email: string;
    setEmail: (val: string) => void;
    mobileNumber: string;
    setMobileNumber: (val: string) => void;
    category: string;
    setCategory: (val: string) => void;
    studentId: string;
    setStudentId: (val: string) => void;
    remarks: string;
    setRemarks: (val: string) => void;
    allowance: string;
    setAllowance: (val: string) => void;
}

export const ConsumerModal = ({
    isOpen,
    onClose,
    onSubmit,
    editingConsumer,
    name,
    setName,
    email,
    setEmail,
    mobileNumber,
    setMobileNumber,
    category,
    setCategory,
    studentId,
    setStudentId,
    remarks,
    setRemarks,
    allowance,
    setAllowance
}: ConsumerModalProps) => {
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

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={handleClose}
            title={editingConsumer ? 'Edit Consumer' : 'Add New Consumer'}
            subtitle="Consumer Management"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <User size={20} />
                </div>
            }
            maxWidth="xl"
            footer={
                <div className="flex justify-end gap-3">
                    <Button variant="secondary" type="button" onClick={handleClose}>Cancel</Button>
                    <Button form="consumer-form" type="submit">Save Consumer</Button>
                </div>
            }
        >
            <form id="consumer-form" onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Full Name"
                    required
                    type="text"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); markDirty(); }}
                    placeholder="e.g. John Doe"
                />
                <Input
                    label="Email Address"
                    required
                    type="email"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); markDirty(); }}
                    placeholder="john@example.com"
                />
                <Input
                    label="Mobile Number"
                    required
                    type="tel"
                    value={mobileNumber}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setMobileNumber(e.target.value); markDirty(); }}
                    placeholder="+91..."
                />
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Category <span className="text-red-500">*</span></label>
                    <CustomSelect
                        value={category}
                        onChange={(val) => { setCategory(val); markDirty(); }}
                        placeholder="Select Category"
                        options={[
                            { value: 'Part-time', label: 'Part-time', icon: Tag },
                            { value: 'Full-time', label: 'Full-time', icon: Tag },
                            { value: 'Guest', label: 'Guest', icon: Tag },
                            { value: 'Student', label: 'Student', icon: Tag },
                            { value: 'Staff Delegate', label: 'Staff Delegate', icon: Tag }
                        ]}
                    />
                </div>
                {category === 'Student' && (
                    <>
                        <Input
                            label="Student ID"
                            required
                            type="text"
                            maxLength={50}
                            value={studentId}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setStudentId(e.target.value); markDirty(); }}
                            placeholder="e.g. STU-2026-001"
                        />
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                            <textarea
                                value={remarks}
                                onChange={e => { setRemarks(e.target.value); markDirty(); }}
                                className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-0 outline-none h-24 resize-none text-sm text-slate-700 transition-all shadow-inner"
                                placeholder="Optional notes about this student..."
                            />
                        </div>
                    </>
                )}
                <Input
                    label={`Opening Balance (${CURRENCY_SYMBOL})`}
                    required
                    type="number"
                    step="0.01"
                    value={allowance}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAllowance(e.target.value); markDirty(); }}
                    placeholder="0.00"
                    leftIcon={<span className="text-xs font-bold">{CURRENCY_SYMBOL}</span>}
                />
                <p className="text-[10px] text-slate-400 ml-1 font-medium mt-1 italic">
                    * Initial credit balance for this consumer.
                </p>
            </form>
        </AccessibleModal>
    );
};
