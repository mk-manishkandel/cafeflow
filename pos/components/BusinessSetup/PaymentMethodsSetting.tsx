import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit2, AlertCircle, CreditCard, Banknote, Smartphone, X, Save, Shield } from 'lucide-react';
import { CustomSelect } from '../shared/CustomSelect';
import { getPaymentMethods, addPaymentMethod, updatePaymentMethod, deletePaymentMethod } from '../../services/storageService';
import { useUI } from '../ui/UIContext';
import { useBranch } from '../../contexts/BranchContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import logger from '../../utils/logger';
import { AccessibleModal } from '../ui/AccessibleModal';

export interface PaymentMethod {
    id: string;
    name: string;
    type: 'cash' | 'card' | 'digital' | 'bank';
    isDefault: boolean;
    isGlobal: boolean;
    branchId?: string | null;
    branchName?: string | null;
    qrType?: 'none' | 'static';
    qrData?: string | null;
    showQrInPos?: boolean;
}

const PRESET_GATEWAYS = ['Fonepay', 'Esewa', 'Khalti', 'NepalPay', 'Other'];
const GATEWAY_OPTIONS = [
    { value: 'Fonepay', label: 'Fonepay', description: 'Digital Wallet', icon: Smartphone },
    { value: 'Esewa', label: 'Esewa', description: 'Digital Wallet', icon: Smartphone },
    { value: 'Khalti', label: 'Khalti', description: 'Digital Wallet', icon: Smartphone },
    { value: 'NepalPay', label: 'NepalPay', description: 'Local Payment Gateway', icon: CreditCard },
    { value: 'Other', label: 'Other', description: 'Custom Payment Method', icon: Plus }
];

export const PaymentMethodsSetting = () => {
    const { showToast } = useUI();
    const { currentBranch, branches } = useBranch();
    const isMainBranchAdmin = useMemo(() => currentBranch?.name === 'Main Branch', [currentBranch]);
    // Separate gateway selection state (decoupled from name for "Other" display fix)
    const [selectedGateway, setSelectedGateway] = useState<string>('');
    const [editingGateway, setEditingGateway] = useState<string>('');
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // Edit State
    const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);

    // Delete State
    const [deleteId, setDeleteId] = useState<string | null>(null);

    // New Method State for Add Modal
    const [newMethod, setNewMethod] = useState<Omit<PaymentMethod, 'id' | 'isDefault'>>({
        name: '',
        type: 'cash',
        isGlobal: false,
        qrType: 'none',
        qrData: null,
        showQrInPos: false
    });

    const loadMethods = async () => {
        try {
            setLoading(true);
            // For Main Branch admin (sees all), pass no branchId filter.
            // For any other branch (including when admin has switched context), filter strictly by that branch.
            const filterBranchId = isMainBranchAdmin ? undefined : currentBranch?.id;
            const data = await getPaymentMethods(filterBranchId, true); // forceRefresh to avoid stale cache
            setMethods(data as PaymentMethod[]);
        } catch (err) {
            logger.error('Failed to load payment methods', err);
            showToast('Failed to load payment methods', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMethods();
    }, [currentBranch?.id]); // re-load whenever the selected branch changes

    const handleAdd = async () => {
        if (!newMethod.name.trim()) {
            showToast('Method name cannot be empty', 'error');
            return;
        }

        if (isMainBranchAdmin && !newMethod.branchId) {
            showToast('Please select a target branch (Cafe, Canteen, etc.)', 'error');
            return;
        }

        if (newMethod.qrType === 'static' && !newMethod.qrData) {
            showToast('Please upload a QR code image', 'error');
            return;
        }
        setLoading(true);
        try {
            await addPaymentMethod(newMethod.name, newMethod.type, newMethod.qrType, newMethod.qrData, newMethod.showQrInPos, isMainBranchAdmin ? (newMethod.branchId || undefined) : currentBranch?.id);
            showToast('Method added successfully', 'success');
            setNewMethod({ name: '', type: 'cash', isGlobal: false, qrType: 'none', qrData: null, showQrInPos: false });
            setSelectedGateway('');
            setIsAdding(false);
            loadMethods();
        } catch (err: any) {
            showToast(err.message || 'Failed to add method', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingMethod) return;
        if (!editingMethod.name.trim()) {
            showToast('Method name cannot be empty', 'error');
            return;
        }

        if (editingMethod.qrType === 'static' && !editingMethod.qrData) {
            showToast('Please upload a QR code image', 'error');
            return;
        }
        setLoading(true);
        try {
            await updatePaymentMethod(editingMethod.id, editingMethod.name, editingMethod.type, editingMethod.qrType, editingMethod.qrData, editingMethod.showQrInPos);
            showToast('Method updated successfully', 'success');
            setEditingMethod(null);
            loadMethods();
        } catch (err: any) {
            showToast(err.message || 'Failed to update method', 'error');
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        setLoading(true);
        try {
            await deletePaymentMethod(deleteId);
            showToast('Method deleted successfully', 'success');
            setDeleteId(null);
            loadMethods();
        } catch (err: any) {
            showToast(err.message || 'Failed to delete', 'error');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (method: PaymentMethod) => {
        setEditingMethod({
            ...method,
            qrType: method.qrType || 'none',
            qrData: method.qrData || null,
            showQrInPos: method.showQrInPos || false
        });
        // Set gateway dropdown state
        setEditingGateway(PRESET_GATEWAYS.includes(method.name) ? method.name : 'Other');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isEditing: boolean) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate File Format
        const allowedFormats = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedFormats.includes(file.type)) {
            showToast('Invalid format. Please upload a JPEG, PNG, or WEBP image.', 'error');
            return;
        }

        // Validate File Size (Increased to 5MB to match backend)
        if (file.size > 5 * 1024 * 1024) {
            showToast('Image size should be less than 5MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            if (isEditing && editingMethod) {
                setEditingMethod({ ...editingMethod, qrData: base64String });
            } else {
                setNewMethod({ ...newMethod, qrData: base64String });
            }
        };
        reader.readAsDataURL(file);
    };

    if (loading && methods.length === 0 && !isAdding && !editingMethod && !deleteId) {
        return <div className="p-8 text-center text-slate-500">Loading payment methods...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Payment Methods</h3>
                    <p className="text-slate-500 text-sm">
                        {isMainBranchAdmin
                            ? 'Managing all payment methods across all branches.'
                            : `Showing methods for ${currentBranch?.name || 'your branch'}.`}
                    </p>
                </div>
                <Button
                    onClick={() => setIsAdding(true)}
                    leftIcon={<Plus size={16} />}
                >
                    Add Method
                </Button>
            </div>

            <div className="grid gap-3">
                {methods.map(method => (
                    <div key={method.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-200 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${method.type === 'cash' ? 'bg-emerald-100 text-emerald-600' :
                                method.type === 'card' ? 'bg-indigo-100 text-indigo-600' :
                                    method.type === 'digital' ? 'bg-amber-100 text-amber-600' :
                                        'bg-blue-100 text-blue-600' // For 'bank' type
                                }`}>
                                {method.type === 'cash' && <Banknote size={20} />}
                                {method.type === 'card' && <CreditCard size={20} />}
                                {method.type === 'digital' && <Smartphone size={20} />}
                                {method.type === 'bank' && <Banknote size={20} />} {/* Reusing Banknote for bank */}
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800">{method.name}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{method.type}</p>
                                    {method.isGlobal ? (
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border border-slate-200">System Global</span>
                                    ) : (
                                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border border-indigo-100">
                                            {method.branchName || 'Branch specific'}
                                        </span>
                                    )}
                                    {method.qrType && method.qrType !== 'none' && (
                                        <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border border-amber-100 flex items-center gap-1">
                                            Static QR
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Show edit/delete if:
                             - Main branch admin (can edit anything), OR belongs to their branch */}
                        {(isMainBranchAdmin || method.branchId === currentBranch?.id) && (
                            <div className="flex items-center gap-1">
                                {!method.isDefault && (
                                    <>
                                        <Button
                                            variant="ghost"
                                            onClick={() => startEdit(method)}
                                            className="!p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                            title="Edit"
                                        >
                                            <Edit2 size={18} />
                                        </Button>
                                        <Button
                                            variant="danger"
                                            onClick={() => setDeleteId(method.id)}
                                            className="!p-2 shadow-none bg-transparent hover:bg-red-50 text-slate-400 hover:text-red-600"
                                            title="Delete"
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                        {method.isDefault && (
                            <div className="flex items-center gap-2">
                                <Shield size={14} className="text-slate-400" />
                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">Default</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Edit Modal */}
            {editingMethod && (
                <AccessibleModal
                    isOpen
                    onClose={() => setEditingMethod(null)}
                    hideHeader
                    ariaLabelledBy="pm-edit-title"
                    closeOnOverlayClick={false}
                    overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
                    bodyClassName="contents"
                >
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
                                <h2 id="pm-edit-title" className="text-xl font-bold text-slate-800">Edit Payment Method</h2>
                                <Button variant="ghost" onClick={() => setEditingMethod(null)} className="!p-1 hover:bg-slate-200">
                                    <X size={24} />
                                </Button>
                            </div>
                            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                                <div>
                                    <CustomSelect
                                        label="Gateway"
                                        required
                                        value={editingGateway}
                                        onChange={val => {
                                            setEditingGateway(val);
                                            if (val === 'Fonepay') {
                                                setEditingMethod({
                                                    ...editingMethod,
                                                    name: val,
                                                    type: 'digital'
                                                });
                                            } else if (val === 'Other') {
                                                setEditingMethod({ ...editingMethod, name: '' });
                                            } else {
                                                setEditingMethod({ ...editingMethod, name: val });
                                            }
                                        }}
                                        options={GATEWAY_OPTIONS}
                                        placeholder="Select a gateway"
                                        className="mb-3"
                                    />

                                    {(!PRESET_GATEWAYS.includes(editingMethod.name) || editingMethod.name === '' || (PRESET_GATEWAYS.includes(editingMethod.name) && !['Fonepay', 'Esewa', 'Khalti', 'NepalPay'].includes(editingMethod.name))) && (
                                        <div className="animate-in slide-in-from-top-2 duration-200">
                                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Custom Method Name</label>
                                            <Input
                                                type="text"
                                                value={editingMethod.name === 'Other' ? '' : editingMethod.name}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingMethod({ ...editingMethod, name: e.target.value })}
                                                placeholder="e.g. My Custom Gateway"
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <CustomSelect
                                        label="Type"
                                        required
                                        value={editingMethod.type}
                                        onChange={(val) => {
                                            const newType = val as 'cash' | 'card' | 'digital' | 'bank';
                                            setEditingMethod({
                                                ...editingMethod,
                                                type: newType,
                                                qrType: newType === 'cash' ? 'none' : editingMethod.qrType,
                                                qrData: newType === 'cash' ? null : editingMethod.qrData
                                            });
                                        }}
                                        options={[
                                            { value: 'cash', label: 'Cash' },
                                            { value: 'digital', label: 'Digital Wallet' },
                                            { value: 'card', label: 'Card Payment' },
                                            { value: 'bank', label: 'Bank Transfer' }
                                        ]}
                                    />
                                </div>

                                {editingMethod.type !== 'cash' && (
                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">QR Code Configuration</label>
                                        <div className="flex gap-4">
                                            {['none', 'static'].map((type) => (
                                                <label key={type} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all flex-1 justify-center ${editingMethod.qrType === type ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                                    <input
                                                        type="radio"
                                                        name="edit-qr-type"
                                                        value={type}
                                                        checked={editingMethod.qrType === type}
                                                        onChange={(e) => setEditingMethod({
                                                            ...editingMethod,
                                                            qrType: e.target.value as any,
                                                            qrData: e.target.value !== 'static' ? null : editingMethod.qrData,
                                                            showQrInPos: false
                                                        })}
                                                        className="hidden"
                                                    />
                                                    <span className="font-semibold text-sm capitalize">{type}</span>
                                                </label>
                                            ))}
                                        </div>

                                        {editingMethod.qrType !== 'none' && (
                                            <>
                                                <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={editingMethod.showQrInPos || false}
                                                        onChange={(e) => setEditingMethod({ ...editingMethod, showQrInPos: e.target.checked })}
                                                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-700">Show QR in POS</span>
                                                        <span className="text-xs text-slate-500">Display this QR code to the customer during checkout</span>
                                                    </div>
                                                </label>
                                            </>
                                        )}

                                        {editingMethod.qrType === 'static' && (
                                            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 border-dashed">
                                                <label className="block text-sm font-bold text-slate-700">Upload Static QR Code Image <span className="text-red-500">*</span></label>
                                                <div className="flex items-center gap-4">
                                                    {editingMethod.qrData && (
                                                        <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0">
                                                            <img src={editingMethod.qrData} alt="QR Code" className="w-full h-full object-cover" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={(e) => handleFileChange(e, true)}
                                                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer"
                                                        />
                                                        <p className="text-xs text-slate-400 mt-1">Recommended: Square format, Max 2MB.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 pt-6">
                                    <Button variant="secondary" onClick={() => setEditingMethod(null)}>Cancel</Button>
                                    <Button onClick={handleUpdate} isLoading={loading} disabled={loading} leftIcon={!loading && <Save size={18} />}>
                                        Update Method
                                    </Button>
                                </div>
                            </div>
                </AccessibleModal>
            )}

            {/* Add Modal */}
            {isAdding && (
                <AccessibleModal
                    isOpen
                    onClose={() => setIsAdding(false)}
                    hideHeader
                    ariaLabelledBy="pm-add-title"
                    closeOnOverlayClick={false}
                    overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
                    panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
                    bodyClassName="contents"
                >
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
                                <h2 id="pm-add-title" className="text-xl font-bold text-slate-800">New Payment Method</h2>
                                <Button variant="ghost" onClick={() => setIsAdding(false)} className="!p-1 hover:bg-slate-200">
                                    <X size={24} />
                                </Button>
                            </div>
                            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                                {isMainBranchAdmin && (
                                    <div className="mb-4">
                                        <CustomSelect
                                            label="Target Branch"
                                            value={newMethod.branchId || ''}
                                            onChange={(val) => setNewMethod({ ...newMethod, branchId: val })}
                                            options={branches
                                                .filter((b: any) => b.name !== 'Main Branch')
                                                .map((b: any) => ({ value: b.id, label: b.name }))
                                            }
                                            placeholder="Select specific target branch"
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1 italic">Payment methods MUST be assigned to an operational branch.</p>
                                    </div>
                                )}
                                <div>
                                    <CustomSelect
                                        label="Gateway"
                                        required
                                        value={selectedGateway}
                                        onChange={val => {
                                            setSelectedGateway(val);
                                            if (val === 'Fonepay') {
                                                setNewMethod({
                                                    ...newMethod,
                                                    name: val,
                                                    type: 'digital'
                                                });
                                            } else if (val === 'Other') {
                                                setNewMethod({ ...newMethod, name: '' });
                                            } else {
                                                setNewMethod({ ...newMethod, name: val });
                                            }
                                        }}
                                        options={GATEWAY_OPTIONS}
                                        placeholder="Select a gateway"
                                        className="mb-3"
                                    />

                                    {(!PRESET_GATEWAYS.includes(newMethod.name) || newMethod.name === '' || (PRESET_GATEWAYS.includes(newMethod.name) && !['Fonepay', 'Esewa', 'Khalti', 'NepalPay'].includes(newMethod.name))) && (
                                        <div className="animate-in slide-in-from-top-2 duration-200">
                                            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Custom Method Name</label>
                                            <Input
                                                type="text"
                                                value={newMethod.name === 'Other' ? '' : newMethod.name}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMethod({ ...newMethod, name: e.target.value })}
                                                placeholder="e.g. Card Machine"
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <CustomSelect
                                        label="Type"
                                        required
                                        value={newMethod.type}
                                        onChange={(val) => {
                                            const newType = val as 'cash' | 'card' | 'digital' | 'bank';
                                            setNewMethod({
                                                ...newMethod,
                                                type: newType,
                                                qrType: newType === 'cash' ? 'none' : newMethod.qrType,
                                                qrData: newType === 'cash' ? null : newMethod.qrData
                                            });
                                        }}
                                        options={[
                                            { value: 'cash', label: 'Cash' },
                                            { value: 'digital', label: 'Digital Wallet' },
                                            { value: 'card', label: 'Card Payment' },
                                            { value: 'bank', label: 'Bank Transfer' }
                                        ]}
                                    />
                                </div>

                                {newMethod.type !== 'cash' && (
                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">QR Code Configuration</label>
                                        <div className="flex gap-4">
                                            {['none', 'static'].map((type) => (
                                                <label key={type} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all flex-1 justify-center ${newMethod.qrType === type ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                                                    <input
                                                        type="radio"
                                                        name="new-qr-type"
                                                        value={type}
                                                        checked={newMethod.qrType === type}
                                                        onChange={(e) => setNewMethod({
                                                            ...newMethod,
                                                            qrType: e.target.value as any,
                                                            qrData: e.target.value !== 'static' ? null : newMethod.qrData,
                                                            showQrInPos: false
                                                        })}
                                                        className="hidden"
                                                    />
                                                    <span className="font-semibold text-sm capitalize">{type}</span>
                                                </label>
                                            ))}
                                        </div>

                                        {newMethod.qrType !== 'none' && (
                                            <>
                                                <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={newMethod.showQrInPos || false}
                                                        onChange={(e) => setNewMethod({ ...newMethod, showQrInPos: e.target.checked })}
                                                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-700">Show QR in POS</span>
                                                        <span className="text-xs text-slate-500">Display during checkout at the counter</span>
                                                    </div>
                                                </label>
                                            </>
                                        )}

                                        {newMethod.qrType === 'static' && (
                                            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 border-dashed">
                                                <label className="block text-sm font-bold text-slate-700">Upload Static QR Code Image <span className="text-red-500">*</span></label>
                                                <div className="flex items-center gap-4">
                                                    {newMethod.qrData && (
                                                        <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0">
                                                            <img src={newMethod.qrData} alt="QR Code" className="w-full h-full object-cover" />
                                                        </div>
                                                    )}
                                                    <div className="flex-1">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={(e) => handleFileChange(e, false)}
                                                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer"
                                                        />
                                                        <p className="text-xs text-slate-400 mt-1">Recommended: Square format, Max 2MB.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 pt-6">
                                    <Button variant="secondary" onClick={() => setIsAdding(false)}>Cancel</Button>
                                    <Button onClick={handleAdd} isLoading={loading} disabled={loading}>
                                        Create Method
                                    </Button>
                                </div>
                            </div>
                </AccessibleModal>
            )}

            {/* Delete Confirmation Modal */}
            {deleteId && (
                <AccessibleModal
                    isOpen
                    onClose={() => setDeleteId(null)}
                    hideHeader
                    ariaLabelledBy="pm-delete-title"
                    closeOnOverlayClick={false}
                    overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
                    panelClassName="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in zoom-in-95"
                    bodyClassName="contents"
                >
                            <div className="flex gap-4">
                                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                                    <AlertCircle className="text-red-600 w-6 h-6" />
                                </div>
                                <div>
                                    <h3 id="pm-delete-title" className="text-lg font-bold text-slate-800">Delete Payment Method?</h3>
                                    <p className="text-slate-500 text-sm mt-1">
                                        Are you sure you want to delete this payment method? This action cannot be undone.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setDeleteId(null)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    disabled={loading}
                                    className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium disabled:opacity-50"
                                >
                                    {loading ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                </AccessibleModal>
            )}
        </div>
    );
};
