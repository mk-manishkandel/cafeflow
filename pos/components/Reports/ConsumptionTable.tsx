import React from 'react';
import { History } from 'lucide-react';
import { Transaction } from '../../types';
import { EmptyState } from '../shared/EmptyState';
import { getAppTimezone } from '../../utils/dateUtils';

import { formatCurrency } from '../../utils/currency';
interface ConsumptionTableProps {
    transactions: Transaction[];
    loading: boolean;
    isMainBranch: boolean;
    searchQuery: string;
    onTransactionClick?: (tx: Transaction) => void;
}

export const ConsumptionTable: React.FC<ConsumptionTableProps> = ({
    transactions,
    loading,
    isMainBranch,
    searchQuery,
    onTransactionClick
}) => {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto pt-1">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Order Index</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Temporal Detail</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type Class</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Member Identity</th>
                            {isMainBranch && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch Locale</th>}
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[320px]">Consumption Items</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Aggregate Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && transactions.length === 0 ? (
                            <tr>
                                <td colSpan={isMainBranch ? 7 : 6} className="p-20 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <History className="animate-spin text-indigo-600" size={32} />
                                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Synchronizing Data...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : transactions.length > 0 ? (
                            transactions.map(txn => (
                                <tr key={txn.id} className="hover:bg-indigo-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => onTransactionClick?.(txn)}
                                            className="text-xs font-bold text-slate-900 font-mono tracking-tighter uppercase select-all bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 transition-colors px-2 py-1 rounded cursor-pointer ring-offset-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            title="View Order Details"
                                        >
                                            {txn.id.substring(0, 8).toUpperCase()}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-bold text-slate-900">{new Date(txn.timestamp).toLocaleDateString('en-US', { timeZone: getAppTimezone() })}</div>
                                        <div className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">{new Date(txn.timestamp).toLocaleTimeString('en-US', { timeZone: getAppTimezone() })}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {txn.type === 'POS-N' || txn.staffId === 'POS-N' ? (
                                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-widest">POS-N</span>
                                        ) : txn.staffId?.startsWith('COUPON_') ? (
                                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-widest">COUPON</span>
                                        ) : txn.consumerId ? (
                                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-widest">CONSUMER</span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-widest">STAFF</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-bold text-slate-800 uppercase tracking-tight">{txn.staffName}</div>
                                    </td>
                                    {isMainBranch && (
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100 w-fit">
                                                {(txn as any).branchName || 'CafeFlow'}
                                            </div>
                                        </td>
                                    )}
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1.5 max-w-[400px]">
                                            {txn.items.slice(0, 5).map((item, idx) => (
                                                <span key={item.id ?? item.name ?? idx} className="px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-bold text-slate-700 rounded shadow-sm whitespace-nowrap uppercase tracking-tight group-hover:border-indigo-200 transition-colors">
                                                    {item.quantity}× {item.name}
                                                </span>
                                            ))}
                                            {txn.items.length > 5 && (
                                                <span className="px-2 py-0.5 bg-slate-50 text-[10px] text-slate-400 font-bold rounded border border-slate-100 uppercase tracking-widest">+{txn.items.length - 5} MORE</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(txn.totalAmount)}</div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={isMainBranch ? 7 : 6} className="p-0">
                                    <div className="py-20 flex justify-center">
                                        <EmptyState title={searchQuery ? "No matching consumption records found in metadata." : "No consumption recorded for this specified period."} />
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
