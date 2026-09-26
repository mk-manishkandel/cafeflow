import React, { useState, useEffect } from 'react';
import { MenuItem, Category } from '../../../types';
import { Branch } from '../../../services/storageService';
import { CustomSelect } from '../../shared/CustomSelect';
import { Layout, Tag, MapPin, Wand2, Upload, Loader2 } from 'lucide-react';
import { uploadMenuImage } from '../../../services/menuService';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AccessibleModal } from '../../ui/AccessibleModal';
import { useUI } from '../../ui/UIContext';
import logger from '../../../utils/logger';

import { CURRENCY_SYMBOL } from '../../../utils/currency';
interface MenuModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    editingItem: MenuItem | null;
    name: string;
    setName: (val: string) => void;
    price: string;
    setPrice: (val: string) => void;
    category: string;
    setCategory: (val: string) => void;
    image: string;
    setImage: (val: string) => void;
    categories: Category[];
    isMainBranch: boolean;
    branches: Branch[];
    selectedBranchId: string;
    setSelectedBranchId: (val: string) => void;
    onAI: () => void;
    isGenerating: boolean;
    available: boolean;
    setAvailable: (val: boolean) => void;
}

export const MenuModal = ({
    isOpen,
    onClose,
    onSubmit,
    editingItem,
    name,
    setName,
    price,
    setPrice,
    category,
    setCategory,
    image,
    setImage,
    categories,
    isMainBranch,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    onAI,
    isGenerating,
    available,
    setAvailable
}: MenuModalProps) => {
    const { showToast } = useUI();
    const [isUploading, setIsUploading] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);

    // Reset dirty state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setIsDirty(false);
            setAttemptedSubmit(false);
        }
    }, [isOpen]);

    const markDirty = () => setIsDirty(true);

    const handleClose = () => {
        if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
        onClose();
    };

    const handleSubmit = (e: React.FormEvent) => {
        if (!category) {
            e.preventDefault();
            setAttemptedSubmit(true);
            return;
        }
        setIsDirty(false);
        onSubmit(e);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const result = await uploadMenuImage(file);
            if (result?.url) {
                setImage(result.url);
                markDirty();
            }
        } catch (err) {
            logger.error('Upload menu image failed', err);
            showToast('Failed to upload image. Please try again.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={handleClose}
            title={editingItem ? 'Edit Menu Item' : 'New Menu Item'}
            subtitle="Catalog Management"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <Layout size={20} />
                </div>
            }
            maxWidth="3xl"
            footer={
                <div className="flex gap-3 w-full sm:justify-end">
                    <Button variant="ghost" type="button" onClick={handleClose} className="flex-1 sm:flex-none shadow-none hover:bg-slate-100 font-bold">Cancel</Button>
                    <Button type="submit" form="menu-modal-form" className="flex-1 sm:flex-none shadow-lg shadow-indigo-100 font-bold">Save Item</Button>
                </div>
            }
        >
            <form id="menu-modal-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                    {isMainBranch && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Target Distribution Branch</label>
                            <CustomSelect
                                value={selectedBranchId}
                                onChange={(val) => { setSelectedBranchId(val); markDirty(); }}
                                placeholder="Select Branch"
                                options={branches
                                    .filter(b => b.name !== 'Main Branch')
                                    .map(b => ({
                                        value: b.id,
                                        label: b.name,
                                        icon: MapPin
                                    }))
                                }
                            />
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Item Descriptor</label>
                            <div className="flex gap-2">
                                <Input
                                    required
                                    type="text"
                                    value={name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                                    placeholder="e.g. Club Sandwich"
                                    className="bg-slate-50/50"
                                />
                                <Button
                                    type="button"
                                    onClick={onAI}
                                    disabled={!name || isGenerating}
                                    isLoading={isGenerating}
                                    className="bg-indigo-600 !h-11 px-4 shrink-0 shadow-lg shadow-indigo-100 hover:scale-105"
                                    leftIcon={!isGenerating && <Wand2 size={16} />}
                                >
                                    <span className="text-xs font-black">AI</span>
                                </Button>
                            </div>
                        </div>

                        <div className="w-full sm:w-48 space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Pricing ({CURRENCY_SYMBOL})</label>
                            <Input
                                required
                                type="number"
                                step="0.01"
                                value={price}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(e.target.value)}
                                placeholder="0.00"
                                className="bg-slate-50/50 text-right font-black tabular-nums"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Menu Category <span className="text-red-500">*</span></label>
                        <CustomSelect
                            value={category}
                            onChange={(val) => { setCategory(val); markDirty(); }}
                            placeholder="Select Category"
                            required
                            error={!category && attemptedSubmit}
                            options={categories
                                .filter(c => !selectedBranchId || c.branchId === selectedBranchId)
                                .map(c => ({
                                    value: c.name,
                                    label: c.name,
                                    icon: Tag
                                }))
                            }
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Visual Asset</label>
                        <div className="flex gap-4 items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-slate-200 overflow-hidden shrink-0 relative shadow-sm">
                                <img
                                    src={image || '/Menu-Logo.png'}
                                    alt="Preview"
                                    className="w-full h-full object-cover"
                                    onError={(e) => (e.currentTarget.src = '/Menu-Logo.png')}
                                />
                                {isUploading && (
                                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                                        <Loader2 size={24} className="text-indigo-600 animate-spin" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 space-y-2">
                                <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-indigo-300 transition-all shadow-sm group">
                                    <Upload size={14} className="text-slate-400 group-hover:text-indigo-600" />
                                    <span className="text-xs font-black uppercase text-slate-600 group-hover:text-indigo-700">Choose File</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} disabled={isUploading} />
                                </label>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">Min 500x500px suggested</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <label className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 cursor-pointer hover:bg-emerald-50 transition-all group">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-emerald-600 shadow-sm transition-transform group-hover:scale-110">
                                    <Layout size={16} />
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-widest text-emerald-900 leading-none">Current Availability</p>
                                    <p className="text-[10px] text-emerald-600 font-bold italic mt-1 leading-none">
                                        {available ? 'Visible in POS Terminals' : 'Hidden from checkout interface'}
                                    </p>
                                </div>
                            </div>
                            <div className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={available}
                                    onChange={e => setAvailable(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className={`w-11 h-6 rounded-full peer transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${available ? 'bg-emerald-500 after:translate-x-full' : 'bg-slate-200'}`}></div>
                            </div>
                        </label>
                    </div>
                </div>
            </form>
        </AccessibleModal>
    );
};
