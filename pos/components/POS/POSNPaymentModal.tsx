import React from 'react';
import { Banknote, CreditCard, Smartphone } from 'lucide-react';
import clsx from 'clsx';
import { PaymentMethodSettings } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

import { CURRENCY_SYMBOL, formatCurrency } from '../../utils/currency';
import { AccessibleModal } from '../ui/AccessibleModal';
interface POSNPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    total: number;
    amountPaid: string;
    setAmountPaid: (val: string) => void;
    paymentMethod: string | null;
    setPaymentMethod: (id: string) => void;
    availableMethods: PaymentMethodSettings[];
    onConfirm: () => void;
    isProcessing: boolean;
}

export const POSNPaymentModal: React.FC<POSNPaymentModalProps> = ({
    isOpen,
    onClose,
    total,
    amountPaid,
    setAmountPaid,
    paymentMethod,
    setPaymentMethod,
    availableMethods,
    onConfirm,
    isProcessing
}) => {

    if (!isOpen) return null;

    const returnAmount = Math.max(0, (parseFloat(amountPaid) || 0) - total);
    const selectedMethod = availableMethods.find(m => m.id === paymentMethod);
    const isCashIncomplete = selectedMethod?.type === 'cash' && (parseFloat(amountPaid) || 0) < total;

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            hideHeader
            ariaLabelledBy="payment-modal-title"
            closeOnOverlayClick
            overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            panelClassName="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
            bodyClassName="contents"
        >
                    <div className="flex justify-between items-center p-8 pb-4 shrink-0 bg-white z-10">
                        <h3 id="payment-modal-title" className="font-bold text-2xl text-slate-900 uppercase tracking-tight">Payment Settlement</h3>
                        <button 
                            onClick={onClose} 
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                            aria-label="Close modal"
                        >
                            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-8 pb-4 custom-scrollbar">
                        <div className="text-center mb-10 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total Payable Amount</p>
                            <h2 className="text-5xl font-bold text-indigo-600 tracking-tighter tabular-nums">{formatCurrency(total)}</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-8">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount Received</label>
                                <div className="relative group">
                                    <Input
                                        type="number"
                                        value={amountPaid}
                                        onChange={(e) => setAmountPaid(e.target.value)}
                                        placeholder="0.00"
                                        autoFocus
                                        leftIcon={<span className="text-slate-400 font-black">{CURRENCY_SYMBOL}</span>}
                                        inputClassName="!h-[60px] !rounded-2xl !border-2 !text-xl font-bold tabular-nums !pl-12 focus:!border-indigo-600 focus:!ring-0"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Change Return</label>
                                <div className="w-full h-[60px] flex items-center px-6 bg-emerald-50 border-2 border-emerald-100 rounded-2xl text-xl font-bold text-emerald-600 tabular-nums">
                                    {formatCurrency(returnAmount)}
                                </div>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Method of Settlement</label>
                            <div className="grid grid-cols-3 gap-4">
                                {availableMethods.map((m) => {
                                    const Icon = m.type === 'cash' ? Banknote : m.type === 'card' ? CreditCard : Smartphone;
                                    const isActive = paymentMethod === m.id;

                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => {
                                                setPaymentMethod(m.id);
                                                if (m.type !== 'cash') {
                                                    setAmountPaid(total.toFixed(2));
                                                }
                                            }}
                                            className={clsx(
                                                "flex flex-col items-center justify-center gap-3 p-5 border-2 rounded-2xl transition-all relative overflow-hidden group",
                                                isActive
                                                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-100 scale-[1.02]"
                                                    : "border-slate-50 bg-slate-50 hover:border-slate-200 hover:bg-slate-100 text-slate-500"
                                            )}
                                        >
                                            <Icon size={28} className={isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600 transition-colors"} aria-hidden="true" />
                                            <span className="font-bold text-[10px] uppercase tracking-widest">{m.name}</span>
                                            {isActive && (
                                                <div className="absolute top-2 right-2">
                                                    <div className="w-2 h-2 bg-indigo-600 rounded-full" aria-hidden="true" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="p-8 pt-4 bg-white shrink-0 border-t border-slate-50">
                        <Button
                            onClick={onConfirm}
                            disabled={!paymentMethod || isProcessing || isCashIncomplete}
                            isLoading={isProcessing}
                            className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold text-lg uppercase tracking-widest shadow-xl shadow-slate-200 transform active:scale-[0.98]"
                        >
                            Settle & Print
                        </Button>
                    </div>
        </AccessibleModal>
    );
};
