import React from 'react';
import { TableSortIcon } from '../shared/TableSortIcon';
import { EmptyState } from '../shared/EmptyState';

import { formatCurrency } from '../../utils/currency';
interface ItemSalesTableProps {
    data: any[]; // Using any because ItemSalesData is specific to the report
    loading: boolean;
    sortKey: string;
    sortDir: 'asc' | 'desc';
    onSort: (key: string) => void;
}

export const ItemSalesTable: React.FC<ItemSalesTableProps> = ({
    data,
    loading,
    sortKey,
    sortDir,
    onSort
}) => {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                <h3 className="font-bold text-slate-800 uppercase tracking-tight">Sales Details</h3>
                <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1 rounded-full uppercase tracking-widest">{data.length} Items</span>
            </div>
            <div className="overflow-x-auto pt-1">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('itemName')}>
                                <div className="flex items-center gap-2">Item <TableSortIcon column="itemName" sortKey={sortKey} sortDir={sortDir} /></div>
                            </th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('branchName')}>
                                <div className="flex items-center gap-2">Branch <TableSortIcon column="branchName" sortKey={sortKey} sortDir={sortDir} /></div>
                            </th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors text-right" onClick={() => onSort('quantity')}>
                                <div className="flex items-center justify-end gap-2">Qty <TableSortIcon column="quantity" sortKey={sortKey} sortDir={sortDir} /></div>
                            </th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors text-right" onClick={() => onSort('averagePrice')}>
                                <div className="flex items-center justify-end gap-2">Avg Price <TableSortIcon column="averagePrice" sortKey={sortKey} sortDir={sortDir} /></div>
                            </th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors text-right" onClick={() => onSort('totalRevenue')}>
                                <div className="flex items-center justify-end gap-2">Total <TableSortIcon column="totalRevenue" sortKey={sortKey} sortDir={sortDir} /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="px-6 py-4"><div className="h-4 bg-slate-50 rounded-lg w-32"></div></td>
                                    <td className="px-6 py-4"><div className="h-4 bg-slate-50 rounded-lg w-24"></div></td>
                                    <td className="px-6 py-4"><div className="h-4 bg-slate-50 rounded-lg w-12 ml-auto"></div></td>
                                    <td className="px-6 py-4"><div className="h-4 bg-slate-50 rounded-lg w-16 ml-auto"></div></td>
                                    <td className="px-6 py-4"><div className="h-4 bg-slate-50 rounded-lg w-20 ml-auto"></div></td>
                                </tr>
                            ))
                        ) : data.length > 0 ? (
                            data.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4 font-bold text-slate-800">{item.itemName}</td>
                                    <td className="px-6 py-4 text-slate-500 text-sm font-medium">{item.branchName}</td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-900 tabular-nums">{item.quantity}</td>
                                    <td className="px-6 py-4 text-right text-slate-500 text-sm font-bold tabular-nums">{formatCurrency((item.averagePrice || 0))}</td>
                                    <td className="px-6 py-4 text-right font-bold text-indigo-600 tabular-nums">{formatCurrency((item.totalRevenue || 0))}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="py-20"><EmptyState title="No sales found for this period" /></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
