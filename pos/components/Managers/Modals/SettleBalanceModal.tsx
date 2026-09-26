import { Banknote, Smartphone, CreditCard, MessageSquare, Tag } from 'lucide-react';
import { Consumer, PaymentMethodSettings } from '../../../types';
import React, { useRef, useCallback } from 'react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { AccessibleModal } from '../../ui/AccessibleModal';

import { CURRENCY_SYMBOL, formatCurrency } from '../../../utils/currency';
interface SettleBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    consumer: Consumer | null;
    settleBalance: string;
    setSettleBalance: (val: string) => void;
    settleRemarks: string;
    setSettleRemarks: (val: string) => void;
    settleMethod: string;
    setSettleMethod: (val: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    isSettling: boolean;
    availableMethods: PaymentMethodSettings[];
    targetBranchName?: string;
}

export const SettleBalanceModal = ({
    isOpen,
    onClose,
    consumer,
    settleBalance,
    setSettleBalance,
    settleRemarks,
    setSettleRemarks,
    settleMethod,
    setSettleMethod,
    onSubmit,
    isSettling,
    availableMethods,
}: SettleBalanceModalProps) => {
    const amountInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        const amount = parseFloat(settleBalance);
        if (!settleBalance || isNaN(amount) || amount <= 0) {
            e.preventDefault();
            // Auto-focus first invalid field
            setTimeout(() => amountInputRef.current?.focus(), 0);
            return;
        }
        onSubmit(e);
    }, [settleBalance, onSubmit]);

    if (!consumer) return null;

    const payable = consumer.currentBalance < 0 ? Math.abs(consumer.currentBalance) : 0;
    const hasAdvance = consumer.currentBalance > 0;
    const settleNum = parseFloat(settleBalance) || 0;
    const newBalance = settleNum + consumer.currentBalance;
    const willBeAdvance = newBalance > 0;

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title="Settle Balance"
            subtitle="Consumer Transaction"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <Banknote size={20} />
                </div>
            }
            maxWidth="lg"
            footer={
                <div className="flex justify-end gap-3 w-full">
                    <Button variant="secondary" type="button" onClick={onClose} className="shadow-none">Cancel</Button>
                    <Button
                        form="settle-form"
                        type="submit"
                        disabled={isSettling || !settleBalance || parseFloat(settleBalance) <= 0}
                        isLoading={isSettling}
                        leftIcon={!isSettling && <Tag size={18} />}
                    >
                        {isSettling ? 'Processing...' : 'Confirm Settlement'}
                    </Button>
                </div>
            }
        >
            <form id="settle-form" onSubmit={handleSubmit} className="space-y-6">
                {/* Current Balance Status */}
                <div className="p-6 rounded-3xl border text-center bg-slate-50 border-slate-100 shadow-inner">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2 text-slate-400">
                        {hasAdvance ? 'Available Advance' : 'Outstanding Balance'}
                    </p>
                    <p className={`text-4xl font-black ${hasAdvance ? 'text-emerald-600' : 'text-red-600'} tracking-tighter`}>
                        {hasAdvance ? formatCurrency(consumer.currentBalance) : formatCurrency(payable)}
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-4 px-4 py-1.5 bg-white border border-slate-100 rounded-full w-fit mx-auto shadow-sm">
                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{consumer.name}</span>
                        <div className="w-1 h-1 bg-slate-300 rounded-full" />
                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{consumer.category}</span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">Settlement Amount ({CURRENCY_SYMBOL})</label>
                        <Input
                            ref={amountInputRef}
                            required
                            type="number"
                            step="any"
                            value={settleBalance}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettleBalance(e.target.value)}
                            leftIcon={<span className="text-slate-400 font-black">{CURRENCY_SYMBOL}</span>}
                            className="bg-slate-50/50"
                            inputClassName="!h-14 !rounded-2xl !text-2xl font-black tabular-nums focus:!border-indigo-600"
                            placeholder="0.00"
                            data-invalid={!settleBalance || parseFloat(settleBalance) <= 0 ? 'true' : undefined}
                        />
                        {settleBalance && !isNaN(settleNum) && (
                            <div className="flex justify-between items-center text-[10px] font-black px-2 mt-2 uppercase tracking-widest">
                                <span className="text-slate-400">
                                    {willBeAdvance ? 'Resulting Advance' : 'Remaining Balance'}
                                </span>
                                <span className={newBalance >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                    {willBeAdvance && newBalance > 0 && '+'} {formatCurrency(newBalance)}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest flex items-center gap-2">
                            <Banknote size={14} className="text-indigo-500" />
                            Payment Method
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            {availableMethods.map((method) => {
                                const Icon = method.type === 'cash' ? Banknote : method.type === 'card' ? CreditCard : Smartphone;
                                const isActive = settleMethod === method.name;

                                return (
                                    <button
                                        key={method.id}
                                        type="button"
                                        onClick={() => setSettleMethod(method.name)}
                                        className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 gap-2 min-h-[100px] relative overflow-hidden ${isActive
                                            ? `border-indigo-600 bg-indigo-50 text-indigo-700 shadow-lg shadow-indigo-100 scale-[1.02]`
                                            : 'border-slate-100 bg-slate-50/50 hover:bg-white text-slate-500'
                                            }`}
                                    >
                                        <Icon size={24} className={isActive ? "text-indigo-600" : "text-slate-400"} />
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-indigo-700' : 'text-slate-400'}`}>
                                            {method.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest flex items-center gap-2">
                            <MessageSquare size={14} className="text-indigo-500" />
                            Financial Remarks
                        </label>
                        <textarea
                            value={settleRemarks}
                            onChange={e => setSettleRemarks(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-0 outline-none h-24 resize-none text-sm font-bold text-slate-700 transition-all shadow-inner"
                            placeholder="Optional settlement notes..."
                        />
                    </div>
                </div>
            </form>
        </AccessibleModal>
    );
};
