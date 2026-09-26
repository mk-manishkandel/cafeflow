import React from 'react';
import { FileText, FileSpreadsheet, Mail, RotateCcw, ShoppingBag, ChevronDown } from 'lucide-react';
import { Staff, Consumer, Transaction } from '../../../types';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { useUI } from '../../ui/UIContext';
import { getAppTimezone } from '../../../utils/dateUtils';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { DateRangePicker } from '../../shared/DateRangePicker';
import { AccessibleModal } from '../../ui/AccessibleModal';

import { formatCurrency } from '../../../utils/currency';
interface AccountStatementModalProps {
    isOpen: boolean;
    onClose: () => void;
    entity: Staff | Consumer | null;
    type: 'STAFF' | 'CONSUMER';
    transactions: Transaction[];
    startDate: string;
    setStartDate: (val: string) => void;
    endDate: string;
    setEndDate: (val: string) => void;
    onDownloadCSV: () => void;
    onSendEmail: (range: string, start?: string, end?: string) => void;
    sendLoading: boolean;
    canSendEmail?: boolean;
    isSendDropdownOpen: boolean;
    setIsSendDropdownOpen: (val: boolean) => void;
    showCustomDate: boolean;
    setShowCustomDate: (val: boolean) => void;
    customStartDate: string;
    setCustomStartDate: (val: string) => void;
    customEndDate: string;
    setCustomEndDate: (val: string) => void;
    dropdownRef: React.RefObject<HTMLDivElement>;
}

export const AccountStatementModal = ({
    isOpen,
    onClose,
    entity,
    type,
    transactions,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    onDownloadCSV,
    onSendEmail,
    sendLoading,
    canSendEmail = false,
    isSendDropdownOpen,
    setIsSendDropdownOpen,
    showCustomDate,
    setShowCustomDate,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    dropdownRef
}: AccountStatementModalProps) => {
    useClickOutside(dropdownRef, () => setIsSendDropdownOpen(false));
    const { showToast } = useUI();

    if (!entity) return null;

    const subLabel = type === 'STAFF' ? (entity as Staff).department : (entity as Consumer).category;

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title="Account Statement"
            subtitle={`${entity.name} • ${subLabel}`}
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <FileText size={20} />
                </div>
            }
            maxWidth="5xl"
            footer={
                <div className="flex flex-col sm:flex-row justify-end gap-3 w-full">
                    <Button
                        variant="success"
                        onClick={onDownloadCSV}
                        leftIcon={<FileSpreadsheet size={18} />}
                        className="w-full sm:w-auto rounded-xl h-11"
                    >
                        Download CSV
                    </Button>

                    {canSendEmail && <div className="relative" ref={dropdownRef}>
                        <Button
                            onClick={() => {
                                setIsSendDropdownOpen(!isSendDropdownOpen);
                                setShowCustomDate(false);
                            }}
                            disabled={sendLoading || !entity.email}
                            isLoading={sendLoading}
                            leftIcon={!sendLoading && <Mail size={18} />}
                            className="w-full sm:w-auto rounded-xl h-11"
                            title={!entity.email ? 'No email address set' : 'Send statement via email'}
                        >
                            Send Statement
                        </Button>

                        {isSendDropdownOpen && (
                            <div className="absolute right-0 bottom-full mb-2 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 min-w-[260px] animate-in fade-in slide-in-from-bottom-2 z-50">
                                {!showCustomDate ? (
                                    <div className="grid divide-y divide-slate-50">
                                        <button onClick={() => onSendEmail('today')} className="px-5 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 font-bold transition-colors">Today</button>
                                        <button onClick={() => onSendEmail('7d')} className="px-5 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 font-bold transition-colors">Last 7 Days</button>
                                        <button onClick={() => onSendEmail('15d')} className="px-5 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 font-bold transition-colors">Last 15 Days</button>
                                        <button onClick={() => onSendEmail('1m')} className="px-5 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 font-bold transition-colors">Last 1 Month</button>
                                        <button onClick={() => setShowCustomDate(true)} className="px-5 py-3 text-left text-sm text-indigo-600 font-bold hover:bg-indigo-50 flex items-center justify-between group transition-colors">
                                            Custom Range <ChevronDown size={14} className="group-hover:translate-x-1 transition-transform -rotate-90" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Range</p>
                                            <span className="text-[10px] text-slate-400 italic">Max 90 days</span>
                                        </div>
                                        <div className="space-y-3">
                                            <Input
                                                label="From Date"
                                                type="date"
                                                value={customStartDate}
                                                onChange={e => setCustomStartDate(e.target.value)}
                                                className="bg-slate-50/50"
                                            />
                                            <Input
                                                label="To Date"
                                                type="date"
                                                value={customEndDate}
                                                onChange={e => setCustomEndDate(e.target.value)}
                                                className="bg-slate-50/50"
                                            />
                                        </div>
                                        <div className="flex gap-2 pt-2">
                                            <Button variant="ghost" onClick={() => setShowCustomDate(false)} className="flex-1 shadow-none hover:bg-slate-100 h-10 rounded-xl">Back</Button>
                                            <Button
                                                onClick={() => {
                                                    if (!customStartDate || !customEndDate) { showToast('Please select both dates', 'error'); return; }
                                                    onSendEmail('custom', customStartDate, customEndDate);
                                                }}
                                                disabled={!customStartDate || !customEndDate}
                                                className="flex-1 h-10 rounded-xl"
                                            >
                                                Send
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>}
                </div>
            }
        >
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between px-1">
                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
                        <DateRangePicker
                            startDate={startDate}
                            endDate={endDate}
                            onStartDateChange={setStartDate}
                            onEndDateChange={setEndDate}
                        />
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto custom-scrollbar pt-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Date & Time</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Items</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight text-center">Branch</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight text-right">Debit (Dr)</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight text-right">Credit (Cr)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {transactions.map(txn => {
                                    const isRefunded = txn.status === 'REFUNDED';
                                    const isBalanceSettlement = txn.items.some(i => i.name.toLowerCase().includes('balance settlement'));
                                    return (
                                        <tr key={txn.id} className={isRefunded ? 'bg-slate-50/20' : 'hover:bg-slate-50/50 transition-colors'}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className={`text-sm font-bold ${isRefunded ? 'text-slate-400 opacity-50' : 'text-slate-700'}`}>
                                                    {new Date(txn.timestamp).toLocaleDateString(undefined, { timeZone: getAppTimezone() })}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                                    {new Date(txn.timestamp).toLocaleTimeString(undefined, { timeZone: getAppTimezone() })}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`text-sm font-medium ${isRefunded ? 'text-slate-400 opacity-50 line-through' : 'text-slate-800 font-bold'}`}>
                                                    {txn.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                                                </div>
                                                {isRefunded && (
                                                    <div className="flex items-center gap-1 text-[10px] text-red-500 font-black uppercase mt-1 tracking-widest">
                                                        <RotateCcw size={10} /> Refunded
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="text-xs font-black uppercase tracking-widest px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                                                    {(txn as any).branchName || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {!isBalanceSettlement && (
                                                    <span className={`text-sm font-black tabular-nums ${isRefunded ? 'text-slate-300 line-through' : 'text-slate-900'}`}>
                                                        {formatCurrency(txn.totalAmount)}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {isBalanceSettlement && (
                                                    <span className={`text-sm font-black tabular-nums ${isRefunded ? 'text-slate-300 line-through' : 'text-emerald-600'}`}>
                                                        {formatCurrency(txn.totalAmount)}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {transactions.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-20 text-center">
                                            <div className="flex flex-col items-center justify-center gap-4 opacity-30 grayscale">
                                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                                                    <ShoppingBag size={32} />
                                                </div>
                                                <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">No transaction records</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AccessibleModal>
    );
};
