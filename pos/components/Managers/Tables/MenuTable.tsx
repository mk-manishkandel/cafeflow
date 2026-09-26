import React from 'react';
import { ClipboardList, Tag, MapPin, Edit2, Trash2, Calendar, CheckSquare, Square } from 'lucide-react';
import { MenuItem } from '../../../types';
import { TableSortIcon } from '../../shared/TableSortIcon';
import { EmptyState } from '../../shared/EmptyState';
import Skeleton from '../../Skeleton';

import { formatCurrency } from '../../../utils/currency';
interface MenuTableProps {
    loading: boolean;
    items: MenuItem[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onToggleSelectAll: () => void;
    onSort: (key: any) => void;
    sortKey: string;
    sortDir: 'asc' | 'desc';
    isMainBranch: boolean;
    branchMap: Record<string, string>;
    onEdit: (item: MenuItem) => void;
    onDelete: (item: MenuItem) => void;
    canEdit: boolean;
    canDelete: boolean;
}

export const MenuTable = ({
    loading,
    items,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    onSort,
    sortKey,
    sortDir,
    isMainBranch,
    branchMap,
    onEdit,
    onDelete,
    canEdit,
    canDelete
}: MenuTableProps) => {
    const isAllSelected = items.length > 0 && selectedIds.size === items.length;

    return (
        <div className="overflow-x-auto pt-1">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="border-b border-slate-100">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-12 leading-tight">
                            <button onClick={onToggleSelectAll} aria-label={isAllSelected ? "Deselect all items" : "Select all items"} className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-colors">
                                {isAllSelected ? <CheckSquare size={18} className="text-indigo-600" aria-hidden="true" /> : <Square size={18} aria-hidden="true" />}
                            </button>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('name')}>
                            <div className="flex items-center gap-1.5 min-w-[200px]">
                                <ClipboardList size={14} className="text-slate-400" />
                                <span>Item Name</span>
                                <TableSortIcon column="name" sortKey={sortKey} sortDir={sortDir} />
                            </div>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('category')}>
                            <div className="flex items-center gap-1.5 min-w-[120px]">
                                <Tag size={14} className="text-slate-400" />
                                <span>Category</span>
                                <TableSortIcon column="category" sortKey={sortKey} sortDir={sortDir} />
                            </div>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('price')}>
                            <div className="flex items-center gap-1.5">
                                <span>Price</span>
                                <TableSortIcon column="price" sortKey={sortKey} sortDir={sortDir} />
                            </div>
                        </th>
                        {isMainBranch && (
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('branch')}>
                                <div className="flex items-center gap-1.5 min-w-[120px]">
                                    <MapPin size={14} className="text-slate-400" />
                                    <span>Branch</span>
                                    <TableSortIcon column="branch" sortKey={sortKey} sortDir={sortDir} />
                                </div>
                            </th>
                        )}
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('available')}>
                            <div className="flex items-center gap-1.5 min-w-[120px]">
                                <span>Availability</span>
                                <TableSortIcon column="available" sortKey={sortKey} sortDir={sortDir} />
                            </div>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading ? (
                        [...Array(5)].map((_, i) => (
                            <tr key={i}>
                                <td className="px-6 py-4"><Skeleton width={18} height={18} /></td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <Skeleton width={40} height={40} className="rounded-lg" />
                                        <Skeleton width={150} height={14} />
                                    </div>
                                </td>
                                <td className="px-6 py-4"><Skeleton width={100} height={14} /></td>
                                <td className="px-6 py-4"><Skeleton width={80} height={14} /></td>
                                {isMainBranch && <td className="px-6 py-4"><Skeleton width={100} height={14} /></td>}
                                <td className="px-6 py-4 text-right"><Skeleton width={80} height={32} /></td>
                            </tr>
                        ))
                    ) : items.length > 0 ? (
                        items.map(item => (
                            <tr key={item.id} className={`group hover:bg-slate-50/50 transition-colors border-b border-slate-50 ${selectedIds.has(item.id) ? 'bg-indigo-50/50' : ''}`}>
                                <td className="px-6 py-4 text-center">
                                    <button onClick={() => onToggleSelect(item.id)} aria-label={selectedIds.has(item.id) ? `Deselect ${item.name}` : `Select ${item.name}`} className={`p-1 rounded transition-colors ${selectedIds.has(item.id) ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}>
                                        {selectedIds.has(item.id) ? <CheckSquare size={18} aria-hidden="true" /> : <Square size={18} aria-hidden="true" />}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <img
                                                src={item.image || '/Menu-Logo.png'}
                                                alt={item.name}
                                                loading="lazy"
                                                className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-100 shadow-sm"
                                                onError={(e) => (e.currentTarget.src = '/Menu-Logo.png')}
                                            />
                                            {item.isTodayMenu && (
                                                <div className="absolute -top-1.5 -left-1.5 bg-orange-500 text-white rounded-full p-0.5 shadow-sm ring-1 ring-white" title="Today's Menu">
                                                    <Calendar size={10} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-bold text-black text-sm truncate">{item.name}</span>
                                            {item.isTodayMenu && <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mt-0.5 flex items-center gap-0.5"><Calendar size={8} /> Today</span>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm font-medium text-slate-700">
                                        {item.category}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm font-bold text-black">{formatCurrency(Number(item.price))}</span>
                                </td>
                                {isMainBranch && (
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-widest">
                                            <MapPin size={10} /> {branchMap[item.branchId || ''] || 'External'}
                                        </span>
                                    </td>
                                )}
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-colors ${item.available !== false
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                        {item.available !== false ? 'Available' : 'Unavailable'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-1.5">
                                        {canEdit && (
                                            <button
                                                onClick={() => onEdit(item)}
                                                className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
                                                title="Edit Item"
                                                aria-label={`Edit ${item.name}`}
                                            >
                                                <Edit2 size={16} aria-hidden="true" />
                                            </button>
                                        )}
                                        {canDelete && (
                                            <button
                                                onClick={() => onDelete(item)}
                                                className="p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
                                                title="Delete Item"
                                                aria-label={`Delete ${item.name}`}
                                            >
                                                <Trash2 size={16} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr><td colSpan={isMainBranch ? 8 : 7} className="py-24"><EmptyState /></td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
