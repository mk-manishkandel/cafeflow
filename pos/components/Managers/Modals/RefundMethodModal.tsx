import React, { useState, useEffect } from 'react';
import { RefreshCw, Banknote, CreditCard, Wallet, ArrowRight, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { AccessibleModal } from '../../ui/AccessibleModal';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { getPaymentMethods } from '../../../services/setupService';
import { Transaction } from '../../../types';

import { formatCurrency } from '../../../utils/currency';
interface RefundOption {
    id: string;
    name: string;
    type: string;
    description: string;
}

interface RefundMethodModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (refundMethod: string) => Promise<void>;
    txn: Transaction | null;
    branchId?: string;
}

const MOP_ICON: Record<string, React.ElementType> = {
    cash: Banknote,
    digital: CreditCard,
    card: CreditCard,
    bank: CreditCard,
    credit: Wallet,
};

const MOP_DESCRIPTION: Record<string, string> = {
    cash: 'Physical cash returned to customer',
    digital: 'Returned via digital payment reversal',
    card: 'Returned to card via reversal',
    bank: 'Returned via bank transfer',
    credit: 'Amount credited back to their account balance',
};

export const RefundMethodModal: React.FC<RefundMethodModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    txn,
    branchId
}) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [paymentMethods, setPaymentMethods] = useState<RefundOption[]>([]);
    const [loadingMethods, setLoadingMethods] = useState(false);
    const [fetchError, setFetchError] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState<RefundOption | null>(null);
    const [confirmInput, setConfirmInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // A transaction has an internal balance if it belongs to a real consumer or staff member
    // (excludes POS-N anonymous and coupon transactions)
    const hasInternalBalance = txn && (
        !!txn.consumerId ||
        (!!txn.staffId && txn.staffId !== 'POS-N' && !txn.staffId.startsWith('COUPON_'))
    );

    useEffect(() => {
        if (!isOpen) return;
        // Reset all state on open
        setStep(1);
        setSelectedMethod(null);
        setConfirmInput('');
        setIsProcessing(false);
        setFetchError(false);
        setLoadingMethods(true);

        getPaymentMethods(branchId)
            .then(methods => {
                const options: RefundOption[] = methods.map(m => ({
                    id: m.id,
                    name: m.name,
                    type: m.type,
                    description: MOP_DESCRIPTION[m.type] ?? 'Returned to customer',
                }));
                // Inject "Credit to Account" as first option for eligible transactions
                if (hasInternalBalance) {
                    const creditOption: RefundOption = {
                        id: '__credit__',
                        name: 'Credit to Account',
                        type: 'credit',
                        description: MOP_DESCRIPTION.credit,
                    };
                    setPaymentMethods([creditOption, ...options]);
                } else {
                    setPaymentMethods(options);
                }
            })
            .catch(() => setFetchError(true))
            .finally(() => setLoadingMethods(false));
    }, [isOpen, branchId, hasInternalBalance]);

    // Reset confirm input when going back to step 1
    const handleBack = () => {
        setStep(1);
        setConfirmInput('');
    };

    const handleClose = () => {
        if (isProcessing) return;
        onClose();
    };

    const handleConfirm = async () => {
        if (!selectedMethod || confirmInput !== 'REFUND' || isProcessing) return;
        setIsProcessing(true);
        try {
            await onConfirm(selectedMethod.name);
        } finally {
            setIsProcessing(false);
        }
    };

    const isCreditBalance = selectedMethod?.type === 'credit';

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={handleClose}
            title={step === 1 ? 'Select Refund Method' : 'Confirm Refund'}
            subtitle={step === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-100">
                    <RefreshCw size={20} />
                </div>
            }
            maxWidth="md"
            footer={
                step === 1 ? (
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-5 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <Button
                            onClick={() => setStep(2)}
                            disabled={!selectedMethod || loadingMethods}
                            variant="warning"
                            size="lg"
                            rightIcon={<ArrowRight size={16} />}
                        >
                            Next
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-between gap-3">
                        <button
                            type="button"
                            onClick={handleBack}
                            disabled={isProcessing}
                            className="px-5 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            ← Back
                        </button>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={isProcessing}
                                className="px-5 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <Button
                                onClick={handleConfirm}
                                disabled={confirmInput !== 'REFUND' || isProcessing}
                                isLoading={isProcessing}
                                variant="warning"
                                size="lg"
                                leftIcon={<RefreshCw size={16} />}
                            >
                                Refund
                            </Button>
                        </div>
                    </div>
                )
            }
        >
            {step === 1 ? (
                <div className="space-y-4">
                    {txn && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                            <p className="text-slate-500 font-medium">Refunding</p>
                            <p className="font-bold text-slate-800 text-base mt-0.5">
                                {formatCurrency(txn.totalAmount)} — {txn.staffName}
                            </p>
                        </div>
                    )}

                    <p className="text-sm text-slate-600 font-medium">
                        How will the refund be returned to the customer?
                    </p>

                    {loadingMethods ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                            <Loader2 size={18} className="animate-spin" />
                            <span className="text-sm font-medium">Loading payment methods...</span>
                        </div>
                    ) : fetchError ? (
                        <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-red-800">Failed to load payment methods</p>
                                <p className="text-xs text-red-700 mt-0.5">Please close and try again.</p>
                            </div>
                        </div>
                    ) : paymentMethods.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">No payment methods configured.</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {paymentMethods.map(method => {
                                const Icon = MOP_ICON[method.type] || CreditCard;
                                const isSelected = selectedMethod?.id === method.id;
                                return (
                                    <button
                                        key={method.id}
                                        type="button"
                                        onClick={() => setSelectedMethod(method)}
                                        className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                                            isSelected
                                                ? 'border-indigo-500 bg-indigo-50'
                                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            <Icon size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <p className={`font-bold text-sm ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                                                {method.name}
                                            </p>
                                            <p className="text-xs text-slate-400 font-medium">{method.description}</p>
                                        </div>
                                        {isSelected && <CheckCircle2 size={18} className="text-indigo-500 flex-shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Transaction summary */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Transaction</span>
                            <span className="font-bold text-slate-800">{txn?.staffName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Amount</span>
                            <span className="font-bold text-slate-800">{formatCurrency(txn?.totalAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Refund via</span>
                            <span className="font-bold text-indigo-700">{selectedMethod?.name}</span>
                        </div>
                    </div>

                    {/* Balance impact notice */}
                    {isCreditBalance ? (
                        <div className="flex gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-emerald-800">Account balance will be credited</p>
                                <p className="text-xs text-emerald-700 mt-0.5">
                                    {formatCurrency(txn?.totalAmount)} will be added back to the customer's account balance.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-amber-800">Account balance will NOT change</p>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    Money is returned physically via {selectedMethod?.name}. No internal balance adjustment will be made.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Confirmation input */}
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                            Type <span className="text-amber-600">REFUND</span> to confirm
                        </label>
                        <Input
                            value={confirmInput}
                            onChange={e => setConfirmInput(e.target.value)}
                            placeholder="REFUND"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
                        />
                    </div>
                </div>
            )}
        </AccessibleModal>
    );
};
