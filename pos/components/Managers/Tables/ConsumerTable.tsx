import React from 'react';
import { User, Wallet, CreditCard, AlertCircle, Settings, Edit2, Trash2, FileText, CheckCircle2, History } from 'lucide-react';
import { Consumer } from '../../../types';
import { TableSortIcon } from '../../shared/TableSortIcon';
import { EmptyState } from '../../shared/EmptyState';
import Skeleton from '../../Skeleton';
import { UserAvatar } from '../../shared/UserAvatar';

import { formatCurrency } from '../../../utils/currency';
interface ConsumerTableProps {
    loading: boolean;
    consumers: Consumer[];
    selectedConsumerIds: Set<string>;
    onToggleSelectAll: () => void;
    onToggleSelectConsumer: (id: string) => void;
    onSort: (key: any) => void;
    sortKey: string;
    sortDir: 'asc' | 'desc';
    onOpenStatement: (consumer: Consumer) => void;
    onOpenLedger: (consumer: Consumer) => void;
    onSettle: (consumer: Consumer) => void;
    onEdit: (consumer: Consumer) => void;
    onDelete: (consumer: Consumer) => void;
    canEdit: boolean;
    canDelete: boolean;
    currentBranchName?: string;
}

export const ConsumerTable = ({
    loading,
    consumers,
    selectedConsumerIds,
    onToggleSelectAll,
    onToggleSelectConsumer,
    onSort,
    sortKey,
    sortDir,
    onOpenStatement,
    onOpenLedger,
    onSettle,
    onEdit,
    onDelete,
    canEdit,
    canDelete,
    currentBranchName
}: ConsumerTableProps) => {
    return (
        <div className="overflow-x-auto mb-4 pt-1">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-10 leading-tight">
                            <input
                                type="checkbox"
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                checked={consumers.length > 0 && selectedConsumerIds.size === consumers.length}
                                onChange={onToggleSelectAll}
                            />
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('name')}>
                            <span className="flex items-center gap-1.5 font-bold"><User size={14} /> Name <TableSortIcon column="name" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('category')}>
                            <span className="flex items-center gap-1.5 font-bold"><Settings size={14} /> Category <TableSortIcon column="category" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('openingBalance')}>
                            <span className="flex items-center gap-1.5 font-bold"><Wallet size={14} /> Opening <TableSortIcon column="openingBalance" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('spent')}>
                            <span className="flex items-center gap-1.5 font-bold"><CreditCard size={14} /> Spent <TableSortIcon column="spent" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('payable')}>
                            <span className="flex items-center gap-1.5 font-bold"><AlertCircle size={14} /> Balance <TableSortIcon column="payable" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right"><span className="flex items-center gap-1.5 justify-end"><Settings size={14} /> Actions</span></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading ? (
                        [...Array(5)].map((_, i) => (
                            <tr key={i}>
                                <td className="px-6 py-4"><Skeleton width={16} height={16} /></td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <Skeleton circle width={40} height={40} />
                                        <div className="space-y-1">
                                            <Skeleton width={120} height={14} />
                                            <Skeleton width={80} height={10} />
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4"><Skeleton width={100} height={14} /></td>
                                <td className="px-6 py-4"><Skeleton width={80} height={14} /></td>
                                <td className="px-6 py-4"><Skeleton width={80} height={14} /></td>
                                <td className="px-6 py-4"><Skeleton width={100} height={20} className="rounded-lg" /></td>
                                <td className="px-6 py-4 text-right"><Skeleton width={100} height={32} /></td>
                            </tr>
                        ))
                    ) : consumers.length > 0 ? (
                        consumers.map(consumer => {
                            const spent = (consumer.openingBalance || 0) - consumer.currentBalance;
                            const payable = consumer.currentBalance < 0 ? Math.abs(consumer.currentBalance) : 0;

                            return (
                                <tr key={consumer.id} className={`hover:bg-slate-50/30 transition-colors border-b border-slate-50 ${selectedConsumerIds.has(consumer.id) ? 'bg-indigo-50/30' : ''}`}>
                                    <td className="px-6 py-4 w-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                            checked={selectedConsumerIds.has(consumer.id)}
                                            onChange={() => onToggleSelectConsumer(consumer.id)}
                                        />
                                    </td>
                                    <td className="px-6 py-4 min-w-[200px]">
                                        <div className="flex items-center gap-3">
                                            <UserAvatar name={consumer.name} />
                                            <div className="flex flex-col items-start text-left">
                                                <p className="font-bold text-black text-sm whitespace-nowrap">{consumer.name}</p>
                                                <p className="text-[10px] text-slate-400 mb-1">{consumer.mobileNumber || 'No mobile'}</p>
                                                <button onClick={() => onOpenStatement(consumer)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center justify-start gap-1 uppercase tracking-wider whitespace-nowrap">
                                                    <FileText size={10} /> View Statement
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-tight">{consumer.category}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-black">{formatCurrency((consumer.openingBalance || 0))}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-black">{formatCurrency(spent)}</td>
                                    <td className="px-6 py-4">
                                        {payable > 0 ? (
                                            <button
                                                onClick={() => onSettle(consumer)}
                                                disabled={currentBranchName?.includes('Main')}
                                                className="group inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-bold bg-red-50 text-red-600 border border-red-100 uppercase hover:enabled:bg-red-600 hover:enabled:text-white hover:enabled:border-red-600 transition-all shadow-sm disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                                                title={currentBranchName?.includes('Main') ? 'Settlements cannot be made on Management Branch' : ''}
                                            >
                                                <AlertCircle size={10} className="group-hover:hidden" />
                                                <CheckCircle2 size={10} className="hidden group-hover:block" />
                                                Pay {formatCurrency(payable)}
                                            </button>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase shadow-sm">
                                                {formatCurrency(consumer.currentBalance)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => onOpenLedger(consumer)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Balance History" aria-label={`View balance history for ${consumer.name}`}><History size={16} aria-hidden="true" /></button>
                                            {canEdit && (
                                                <button
                                                    onClick={() => onSettle(consumer)}
                                                    disabled={currentBranchName?.includes('Main')}
                                                    className="p-2 text-slate-400 hover:enabled:text-emerald-600 hover:enabled:bg-emerald-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                    title={currentBranchName?.includes('Main') ? 'Settlements restricted on Management Branch' : 'Settle Balance'}
                                                    aria-label={`Settle balance for ${consumer.name}`}
                                                >
                                                    <Wallet size={16} aria-hidden="true" />
                                                </button>
                                            )}
                                            {canEdit && (
                                                <button onClick={() => onEdit(consumer)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Edit" aria-label={`Edit ${consumer.name}`}><Edit2 size={16} aria-hidden="true" /></button>
                                            )}
                                            {canDelete && (
                                                <button onClick={() => onDelete(consumer)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete" aria-label={`Delete ${consumer.name}`}><Trash2 size={16} aria-hidden="true" /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr><td colSpan={6} className="py-20"><EmptyState /></td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
