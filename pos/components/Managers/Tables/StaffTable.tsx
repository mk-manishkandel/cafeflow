import React from 'react';
import { User, Building, Wallet, CreditCard, AlertCircle, Settings, Edit2, RefreshCw, Trash2, FileText, History } from 'lucide-react';
import { Staff } from '../../../types';
import { TableSortIcon } from '../../shared/TableSortIcon';
import { EmptyState } from '../../shared/EmptyState';
import Skeleton from '../../Skeleton';
import { UserAvatar } from '../../shared/UserAvatar';

import { formatCurrency } from '../../../utils/currency';
interface StaffTableProps {
    loading: boolean;
    staff: Staff[];
    selectedStaffIds: Set<string>;
    onToggleSelectAll: () => void;
    totalItems: number;
    onToggleSelectStaff: (id: string) => void;
    onSort: (key: any) => void;
    sortKey: string;
    sortDir: 'asc' | 'desc';
    onOpenStatement: (staff: Staff) => void;
    onOpenLedger: (staff: Staff) => void;
    onEdit: (staff: Staff) => void;
    onReset: (staff: Staff) => void;
    onDelete: (id: string) => void;
    canEdit: boolean;
    canReset: boolean;
    canDelete: boolean;
}

export const StaffTable = ({
    loading,
    staff,
    selectedStaffIds,
    onToggleSelectAll,
    totalItems,
    onToggleSelectStaff,
    onSort,
    sortKey,
    sortDir,
    onOpenStatement,
    onOpenLedger,
    onEdit,
    onReset,
    onDelete,
    canEdit,
    canReset,
    canDelete
}: StaffTableProps) => {
    return (
        <div className="overflow-x-auto mb-4 pt-1">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-10 leading-tight">
                            <input
                                type="checkbox"
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                checked={totalItems > 0 && selectedStaffIds.size === totalItems}
                                onChange={onToggleSelectAll}
                            />
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('name')}>
                            <span className="flex items-center gap-1.5 font-bold"><User size={14} /> Employee <TableSortIcon column="name" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('department')}>
                            <span className="flex items-center gap-1.5 font-bold"><Building size={14} /> Dept <TableSortIcon column="department" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('monthlyAllowance')}>
                            <span className="flex items-center gap-1.5 font-bold"><Wallet size={14} /> Allowance <TableSortIcon column="monthlyAllowance" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('spent')}>
                            <span className="flex items-center gap-1.5 font-bold"><CreditCard size={14} /> Spent <TableSortIcon column="spent" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('payable')}>
                            <span className="flex items-center gap-1.5 font-bold"><AlertCircle size={14} /> Balance <TableSortIcon column="payable" sortKey={sortKey} sortDir={sortDir} /></span>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <span className="flex items-center gap-1.5 font-bold">Status</span>
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
                                <td className="px-6 py-4"><Skeleton width={60} height={20} className="rounded-lg" /></td>
                                <td className="px-6 py-4 text-right"><Skeleton width={100} height={32} /></td>
                            </tr>
                        ))
                    ) : staff.length > 0 ? (
                        staff.map(member => {
                            const spent = member.monthlyAllowance - member.currentBalance;
                            const payable = member.currentBalance < 0 ? Math.abs(member.currentBalance) : 0;
                            const isSelected = selectedStaffIds.has(member.id);

                            return (
                                <tr key={member.id} className={`transition-colors border-b border-slate-50 ${isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'hover:bg-slate-50/30'}`}>
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer transition-all"
                                            checked={isSelected}
                                            onChange={() => onToggleSelectStaff(member.id)}
                                        />
                                    </td>
                                    <td className="px-6 py-4 min-w-[200px]">
                                        <div className="flex items-center gap-3">
                                            <UserAvatar name={member.name} />
                                            <div className="flex flex-col items-start text-left">
                                                <p className="font-bold text-black text-sm">{member.name}</p>
                                                <p className="text-[10px] text-slate-400 mb-1">{member.mobileNumber || 'No mobile'}</p>
                                                <button onClick={() => onOpenStatement(member)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center justify-start gap-1 uppercase tracking-wider whitespace-nowrap">
                                                    <FileText size={10} /> View Statement
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-tight">{member.department}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-black">{formatCurrency(member.monthlyAllowance)}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-black">{formatCurrency(spent)}</td>
                                    <td className="px-6 py-4">
                                        {payable > 0 ? (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold bg-red-50 text-red-600 border border-red-100 uppercase shadow-sm">
                                                Payable {formatCurrency(payable)}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase shadow-sm">
                                                {formatCurrency(member.currentBalance)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {member.status === 'INACTIVE' ? (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase shadow-sm">
                                                Inactive
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase shadow-sm">
                                                Active
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => onOpenLedger(member)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Balance History" aria-label={`View balance history for ${member.name}`}><History size={16} aria-hidden="true" /></button>
                                            {canEdit && (
                                                <button onClick={() => onEdit(member)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Edit" aria-label={`Edit ${member.name}`}><Edit2 size={16} aria-hidden="true" /></button>
                                            )}
                                            {canReset && (
                                                <button onClick={() => onReset(member)} className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all" title="Reset Salary" aria-label={`Reset salary for ${member.name}`}><RefreshCw size={16} aria-hidden="true" /></button>
                                            )}
                                            {canDelete && (
                                                <button onClick={() => onDelete(member.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete" aria-label={`Delete ${member.name}`}><Trash2 size={16} aria-hidden="true" /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr><td colSpan={8} className="py-20"><EmptyState /></td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
