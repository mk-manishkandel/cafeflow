import React, { useState, useMemo } from 'react';
import { LayoutGrid, CheckSquare, Square, Eye, EyeOff } from 'lucide-react';
import { SearchInput } from '../shared/SearchInput';
import { EmptyState } from '../shared/EmptyState';
import { formatCurrency } from '../../utils/currency';

interface MenuTabProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filteredMenu: any[];
    onToggle: (id: string, enabled: boolean) => void;
    onBulkToggle: (ids: string[], enabled: boolean) => void;
    isMainBranch: boolean;
}

const Switch = ({ enabled, onChange }: { enabled: boolean; onChange: (val: boolean) => void }) => (
    <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onChange(!enabled); }}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-100 ease-in-out focus:outline-none ${enabled ? 'bg-green-500' : 'bg-slate-200'}`}
    >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-100 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
);

const MenuTab: React.FC<MenuTabProps> = ({ searchQuery, setSearchQuery, filteredMenu, onToggle, onBulkToggle, isMainBranch }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const allIds = useMemo(() => filteredMenu.map(i => i.id), [filteredMenu]);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
    const someSelected = selectedIds.size > 0;

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelectedIds(allSelected ? new Set() : new Set(allIds));
    };

    const handleBulkToggle = (enabled: boolean) => {
        const ids = someSelected ? [...selectedIds].filter(id => allIds.includes(id)) : allIds;
        if (ids.length === 0) return;
        onBulkToggle(ids, enabled);
        setSelectedIds(new Set());
    };

    const colSpan = isMainBranch ? 7 : 6;

    return (
        <div className="p-6 h-full flex flex-col">
            {/* Toolbar */}
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search menu items..."
                    className="flex-1 max-w-md"
                />
                <div className="flex items-center gap-2 flex-wrap">
                    {someSelected && (
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                            {selectedIds.size} selected
                        </span>
                    )}
                    <button
                        onClick={() => handleBulkToggle(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
                        title={someSelected ? 'Enable selected items' : 'Enable all items'}
                    >
                        <Eye size={13} />
                        {someSelected ? 'Enable Selected' : 'Enable All'}
                    </button>
                    <button
                        onClick={() => handleBulkToggle(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                        title={someSelected ? 'Disable selected items' : 'Disable all items'}
                    >
                        <EyeOff size={13} />
                        {someSelected ? 'Disable Selected' : 'Disable All'}
                    </button>
                    <div className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold border border-indigo-100 flex items-center gap-1.5">
                        <LayoutGrid size={13} />
                        {filteredMenu.length} Items
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto min-h-0 custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">
                                <button onClick={toggleSelectAll} className="flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors">
                                    {allSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                                </button>
                            </th>
                            <th className="px-3 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-10">SN</th>
                            <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Item Name</th>
                            {isMainBranch && (
                                <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                            )}
                            <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                            <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Price</th>
                            <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Visibility</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                        {filteredMenu.length === 0 ? (
                            <tr>
                                <td colSpan={colSpan} className="p-0">
                                    <div className="py-20 flex justify-center">
                                        <EmptyState title={searchQuery ? `No items found matching "${searchQuery}"` : 'No items available in self-service menu.'} />
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredMenu.map((item, idx) => {
                                const isSelected = selectedIds.has(item.id);
                                return (
                                    <tr
                                        key={item.id}
                                        onClick={() => toggleSelect(item.id)}
                                        className={`cursor-pointer transition-colors border-b border-slate-50 ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}
                                    >
                                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => toggleSelect(item.id)} className="flex items-center justify-center text-slate-300 hover:text-indigo-600 transition-colors">
                                                {isSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-3 text-xs font-bold text-slate-400 tabular-nums">
                                            {idx + 1}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                                    <img
                                                        src={item.image || '/Menu-Logo.png'}
                                                        alt={item.name}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => (e.currentTarget.src = '/Menu-Logo.png')}
                                                    />
                                                </div>
                                                <span className="font-bold text-slate-800">{item.name}</span>
                                            </div>
                                        </td>
                                        {isMainBranch && (
                                            <td className="p-3">
                                                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                    {item.branchName || 'Main'}
                                                </span>
                                            </td>
                                        )}
                                        <td className="p-3">
                                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <span className="font-bold text-slate-800">
                                                {formatCurrency(item.price)}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex justify-center">
                                                <Switch enabled={item.isSelfService} onChange={(val) => onToggle(item.id, val)} />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default React.memo(MenuTab);
