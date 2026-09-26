import React from 'react';
import logger from '../../utils/logger';
import { ShoppingBag, CreditCard } from 'lucide-react';
import Pagination from '../Pagination';
import { getAppTimezone } from '../../utils/dateUtils';

import { formatCurrency } from '../../utils/currency';
interface Transaction {
    id: string;
    total_amount: number;
    date: string;
    status: string;
    payment_method: string;
    recipient_name: string;
    branch_name?: string;
    items: any[] | string;
}

interface TransactionsTabProps {
    transactions: Transaction[];
    setSelectedTx: (tx: Transaction) => void;
    isMainBranch: boolean;
    currentPage: number;
    totalPages: number;
    totalTransactions: number;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
}

const TransactionsTab: React.FC<TransactionsTabProps> = ({
    transactions,
    setSelectedTx,
    isMainBranch,
    currentPage,
    totalPages,
    totalTransactions,
    onPageChange,
    itemsPerPage
}) => {
    return (
        <div className="p-6">
            {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <ShoppingBag size={48} className="mb-4 opacity-20" />
                    <p className="font-bold">No self-service transactions found.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="overflow-x-auto pt-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Order ID</th>
                                    {isMainBranch && (
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                                    )}
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Items</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Method</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Date & Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {(Array.isArray(transactions) ? transactions : []).map(tx => {
                                    let itemsList = [];
                                    try {
                                        itemsList = typeof tx.items === 'string' ? JSON.parse(tx.items) : tx.items;
                                    } catch (e) {
                                        logger.error('Failed to parse transaction items', e);
                                    }

                                    const itemsSummary = Array.isArray(itemsList)
                                        ? itemsList.map(i => `${i.name} x${i.quantity}`).join(', ')
                                        : 'No details';

                                    return (
                                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => setSelectedTx(tx)}
                                                    className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-mono text-xs font-bold transition-all border border-slate-200"
                                                >
                                                    {tx.id.substring(0, 8).toUpperCase()}
                                                </button>
                                            </td>
                                            {isMainBranch && (
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                                        {tx.branch_name}
                                                    </span>
                                                </td>
                                            )}
                                            <td className="px-6 py-4">
                                                <p className="text-xs font-medium text-slate-600 max-w-[200px] truncate" title={itemsSummary}>
                                                    {itemsSummary}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-800 whitespace-nowrap text-sm">{formatCurrency(tx.total_amount)}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className="flex items-center gap-2 font-bold text-slate-600">
                                                    <CreditCard size={14} />
                                                    {tx.payment_method}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${tx.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                                                    }`}>
                                                    {tx.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 text-[11px] font-bold text-right whitespace-nowrap">
                                                {new Date(tx.date).toLocaleString('en-US', { timeZone: getAppTimezone() })}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="border-t border-slate-100 bg-slate-50/30">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={onPageChange}
                            itemsPerPage={itemsPerPage}
                            totalItems={totalTransactions}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(TransactionsTab);
