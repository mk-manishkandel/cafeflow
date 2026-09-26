import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { X, PlusCircle, Trash2, Plus, Minus, MessageSquare, CalendarDays, User, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { MenuItem, Staff, Consumer } from '../../types';
import { MenuItemCard } from './MenuItemCard';

import { CURRENCY_SYMBOL, formatCurrency } from '../../utils/currency';
import { AccessibleModal } from '../ui/AccessibleModal';
interface SelectedRow {
    rowId: string;
    menuItemId?: string;
    name: string;
    price: string;
    quantity: number;
    remarks: string;
}

interface POSCustomItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (
        items: Array<{ name: string; price: number; quantity: number; remarks: string }>,
        eventName: string,
        eventBy: string
    ) => void;
    menuItems: MenuItem[];
    staffList: Staff[];
    consumerList: Consumer[];
}

export const POSCustomItemModal: React.FC<POSCustomItemModalProps> = ({
    isOpen,
    onClose,
    onAdd,
    menuItems,
    staffList,
    consumerList,
}) => {
    const [selectedRows, setSelectedRows] = useState<SelectedRow[]>([]);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
    const [isSelectedExpanded, setIsSelectedExpanded] = useState(false);

    // Event details
    const [eventName, setEventName] = useState('');
    const [eventBy, setEventBy] = useState('');
    const [eventBySearch, setEventBySearch] = useState('');
    const [showMemberDrop, setShowMemberDrop] = useState(false);
    const eventByRef = useRef<HTMLDivElement>(null);


    // Combined member list for Event By dropdown
    const allMembers = useMemo(() => [
        ...staffList.map(s => ({ id: s.id, name: s.name, email: s.email || '', type: 'Staff' as const })),
        ...consumerList.map(c => ({ id: c.id, name: c.name, email: c.email || '', type: 'Consumer' as const })),
    ], [staffList, consumerList]);

    const filteredMembers = useMemo(() => {
        const q = eventBySearch.trim().toLowerCase();
        if (!q) return allMembers;
        return allMembers.filter(m =>
            (m.name?.toLowerCase() ?? '').includes(q) ||
            (m.email?.toLowerCase() ?? '').includes(q)
        );
    }, [allMembers, eventBySearch]);

    // Close member dropdown on outside click
    useEffect(() => {
        if (!showMemberDrop) return;
        const handle = (e: MouseEvent) => {
            if (eventByRef.current && !eventByRef.current.contains(e.target as Node)) {
                setShowMemberDrop(false);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [showMemberDrop]);

    const categories = useMemo(() => {
        const cats = Array.from(new Set(menuItems.map(m => m.category).filter(Boolean)));
        return ['All', ...cats];
    }, [menuItems]);

    const filteredItems = useMemo(() => {
        const q = search.toLowerCase();
        return menuItems.filter(item => {
            const matchesSearch = !q || item.name.toLowerCase().includes(q);
            const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
            return matchesSearch && matchesCategory;
        }).sort((a, b) => (a.isTodayMenu === b.isTodayMenu ? 0 : a.isTodayMenu ? -1 : 1));
    }, [menuItems, search, categoryFilter]);

    const quantityMap = useMemo(() => {
        const map = new Map<string, number>();
        selectedRows.forEach(row => {
            if (row.menuItemId) map.set(row.menuItemId, row.quantity);
        });
        return map;
    }, [selectedRows]);

    const handleMenuItemClick = useCallback((item: MenuItem) => {
        setSelectedRows(prev => {
            const existing = prev.find(r => r.menuItemId === item.id);
            if (existing) {
                return prev.map(r =>
                    r.menuItemId === item.id ? { ...r, quantity: r.quantity + 1 } : r
                );
            }
            return [...prev, {
                rowId: crypto.randomUUID(),
                menuItemId: item.id,
                name: item.name,
                price: item.price.toString(),
                quantity: 1,
                remarks: '',
            }];
        });
    }, []);

    const handleAddCustomRow = () => {
        setSelectedRows(prev => [...prev, {
            rowId: crypto.randomUUID(),
            name: '',
            price: '',
            quantity: 1,
            remarks: '',
        }]);
        setIsSelectedExpanded(true);
    };

    const handleRemoveRow = (rowId: string) => {
        setSelectedRows(prev => prev.filter(r => r.rowId !== rowId));
        setExpandedNotes(prev => { const next = new Set(prev); next.delete(rowId); return next; });
    };

    const handleRowChange = (rowId: string, field: keyof SelectedRow, value: string | number) => {
        setSelectedRows(prev => prev.map(r => r.rowId === rowId ? { ...r, [field]: value } : r));
    };

    const handleQtyChange = (rowId: string, delta: number) => {
        setSelectedRows(prev => prev.map(r => {
            if (r.rowId !== rowId) return r;
            const next = r.quantity + delta;
            return next < 1 ? r : { ...r, quantity: next };
        }));
    };

    const toggleNote = (rowId: string) => {
        setExpandedNotes(prev => {
            const next = new Set(prev);
            next.has(rowId) ? next.delete(rowId) : next.add(rowId);
            return next;
        });
    };

    const grandTotal = selectedRows.reduce((sum, r) => {
        const p = parseFloat(r.price);
        return sum + (isNaN(p) ? 0 : p * r.quantity);
    }, 0);

    const isRowValid = (row: SelectedRow) => {
        const name = row.name.trim();
        const price = parseFloat(row.price);
        return name.length > 0 && !isNaN(price) && price >= 0 && row.quantity >= 1;
    };

    const canSubmit = selectedRows.length > 0 && selectedRows.every(isRowValid);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        onAdd(
            selectedRows.map(r => ({
                name: r.name.trim(),
                price: parseFloat(r.price),
                quantity: r.quantity,
                remarks: r.remarks,
            })),
            eventName.trim(),
            eventBy.trim()
        );
        resetState();
    };

    const resetState = () => {
        setSelectedRows([]);
        setSearch('');
        setCategoryFilter('All');
        setExpandedNotes(new Set());
        setEventName('');
        setEventBy('');
        setEventBySearch('');
        setIsSelectedExpanded(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    if (!isOpen) return null;

    // Shared: selected item row JSX (used in both desktop right panel and mobile expanded list)
    const renderSelectedRow = (row: SelectedRow) => {
        const rowPrice = parseFloat(row.price);
        const subtotal = isNaN(rowPrice) ? null : rowPrice * row.quantity;
        const noteOpen = expandedNotes.has(row.rowId);
        return (
            <div key={row.rowId} className="bg-white rounded-xl border border-slate-200 px-2.5 py-2 space-y-1.5">
                {/* Row 1: name + remove */}
                <div className="flex items-center gap-1.5">
                    <input
                        type="text"
                        placeholder="Item name..."
                        value={row.name}
                        onChange={e => handleRowChange(row.rowId, 'name', e.target.value)}
                        className="flex-1 min-w-0 h-9 text-sm border border-slate-200 rounded-xl px-3 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:outline-none font-medium text-slate-700"
                    />
                    <button type="button" onClick={() => handleRemoveRow(row.rowId)}
                        className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" aria-label={`Remove ${row.name}`}>
                        <Trash2 size={14} />
                    </button>
                </div>

                {/* Row 2: price | qty | subtotal | note toggle */}
                <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 rounded-xl px-2 h-8 shrink-0">
                        <span className="text-xs text-indigo-400 font-semibold">{CURRENCY_SYMBOL}</span>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0"
                            value={row.price}
                            onChange={e => handleRowChange(row.rowId, 'price', e.target.value)}
                            className="w-16 text-sm text-right bg-transparent focus:outline-none tabular-nums font-bold text-indigo-700 placeholder:text-indigo-300"
                        />
                    </div>

                    <div className="flex items-center shrink-0">
                        <button type="button" onClick={() => handleQtyChange(row.rowId, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors" aria-label="Decrease">
                            <Minus size={11} />
                        </button>
                        <span className="w-7 text-center text-sm font-bold tabular-nums">{row.quantity}</span>
                        <button type="button" onClick={() => handleQtyChange(row.rowId, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors" aria-label="Increase">
                            <Plus size={11} />
                        </button>
                    </div>

                    <span className="flex-1 text-right text-xs font-semibold text-indigo-500 tabular-nums">
                        {subtotal !== null ? `= ${formatCurrency(subtotal)}` : '—'}
                    </span>

                    <button type="button" onClick={() => toggleNote(row.rowId)}
                        className={`shrink-0 p-1.5 rounded-lg transition-colors ${noteOpen ? 'text-indigo-500 bg-indigo-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                        aria-label="Toggle note">
                        <MessageSquare size={14} />
                    </button>
                </div>

                {noteOpen && (
                    <input
                        type="text"
                        placeholder="Add a note (e.g. less sugar)..."
                        value={row.remarks}
                        onChange={e => handleRowChange(row.rowId, 'remarks', e.target.value)}
                        autoFocus
                        className="w-full h-8 text-sm border border-slate-200 rounded-xl px-3 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:outline-none animate-in fade-in slide-in-from-top-1 duration-150"
                    />
                )}
            </div>
        );
    };

    // Shared: member dropdown list
    const memberDropdownList = showMemberDrop && filteredMembers.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
            {filteredMembers.map(m => (
                <button
                    key={m.id}
                    type="button"
                    onMouseDown={() => {
                        setEventBy(m.name);
                        setEventBySearch(m.name);
                        setShowMemberDrop(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-indigo-50 transition-colors text-left"
                >
                    <span className="font-medium text-slate-700">{m.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.type === 'Staff' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                        {m.type}
                    </span>
                </button>
            ))}
        </div>
    );

    return (
        <>
            {/* ── MOBILE: full-screen bottom-sheet style (hidden on sm+) ── */}
            <AccessibleModal
                isOpen={isOpen}
                onClose={handleClose}
                hideHeader
                ariaLabelledBy="custom-item-modal-title-mobile"
                closeOnOverlayClick={false}
                overlayClassName="sm:hidden fixed inset-0 h-[100dvh] z-[200] bg-white overflow-hidden"
                panelClassName="flex flex-col w-full h-full animate-in slide-in-from-bottom-5 duration-300"
                bodyClassName="contents"
            >
                {/* Mobile Header */}
                <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        aria-label="Close modal"
                    >
                        <X size={20} />
                    </button>
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                        <PlusCircle size={18} aria-hidden="true" />
                    </div>
                    <h2 id="custom-item-modal-title-mobile" className="text-base font-bold text-slate-900 uppercase tracking-tight">
                        Add Custom Item
                    </h2>
                </div>

                {/* Mobile Event Fields — each on its own row */}
                <div className="shrink-0 border-b border-slate-100 bg-slate-50/30 px-4 py-3 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                        <CalendarDays size={16} className="text-slate-400 shrink-0" />
                        <input
                            type="text"
                            placeholder="Event name (optional)"
                            value={eventName}
                            onChange={e => setEventName(e.target.value)}
                            className="flex-1 h-11 text-sm border border-slate-200 rounded-xl px-3 bg-white focus:bg-white focus:border-indigo-400 focus:outline-none text-slate-700 placeholder:text-slate-400"
                        />
                    </div>
                    <div className="flex items-center gap-2.5 relative" ref={eventByRef}>
                        <User size={16} className="text-slate-400 shrink-0" />
                        <input
                            type="text"
                            placeholder="Event by (customer / staff)"
                            value={eventBySearch}
                            onChange={e => { setEventBySearch(e.target.value); setEventBy(e.target.value); setShowMemberDrop(true); }}
                            onFocus={() => setShowMemberDrop(true)}
                            className="flex-1 h-11 text-sm border border-slate-200 rounded-xl px-3 bg-white focus:bg-white focus:border-indigo-400 focus:outline-none text-slate-700 placeholder:text-slate-400"
                        />
                        {memberDropdownList}
                    </div>
                </div>

                {/* Mobile Search + Categories */}
                <div className="shrink-0 px-4 pt-3 pb-2 border-b border-slate-100 space-y-2">
                    <Input
                        placeholder="Search menu items..."
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                        className="bg-slate-50 border-slate-200 focus:bg-white focus:border-indigo-500 transition-colors"
                    />
                    {categories.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCategoryFilter(cat)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                                        categoryFilter === cat
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Mobile Menu Grid — scrollable */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-4 py-3">
                        {filteredItems.length === 0 ? (
                            <p className="text-center text-slate-400 text-sm py-6">No items found</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {filteredItems.map(item => (
                                    <MenuItemCard
                                        key={item.id}
                                        item={item}
                                        quantity={quantityMap.get(item.id)}
                                        onAdd={handleMenuItemClick}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Mobile Bottom Panel */}
                    <div className="shrink-0 bg-white border-t border-slate-100 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.08)]">
                        {/* Summary bar — only when items exist, toggles expanded list */}
                        {selectedRows.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setIsSelectedExpanded(p => !p)}
                                className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 active:bg-indigo-100 transition-colors"
                            >
                                <span className="text-xs font-bold text-indigo-700">
                                    {selectedRows.length} item{selectedRows.length > 1 ? 's' : ''} · {formatCurrency(grandTotal)}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-indigo-500 font-semibold">
                                    {isSelectedExpanded ? 'Hide' : 'Review'}
                                    {isSelectedExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                </span>
                            </button>
                        )}

                        {/* Expanded selected items */}
                        {isSelectedExpanded && selectedRows.length > 0 && (
                            <div className="max-h-[40vh] overflow-y-auto px-3 py-2 space-y-1.5 bg-slate-50/50">
                                {selectedRows.map(row => renderSelectedRow(row))}
                            </div>
                        )}

                        {/* Add Custom Row — always visible */}
                        <div className="px-4 pt-3 pb-1">
                            <button
                                type="button"
                                onClick={handleAddCustomRow}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 py-2 rounded-xl hover:bg-indigo-50 active:bg-indigo-100 transition-colors border border-dashed border-indigo-200"
                            >
                                <Plus size={12} /> Add Custom Row
                            </button>
                        </div>

                        {/* Submit button */}
                        <div className="px-4 pt-2 pb-3">
                            <Button
                                type="submit"
                                disabled={!canSubmit}
                                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                            >
                                {selectedRows.length > 0
                                    ? `Add ${selectedRows.length} item${selectedRows.length > 1 ? 's' : ''} to Cart`
                                    : 'Add to Cart'}
                            </Button>
                        </div>
                    </div>
                </form>
            </AccessibleModal>

            {/* ── DESKTOP: centered modal with backdrop (hidden on mobile) ── */}
            <AccessibleModal
                isOpen={isOpen}
                onClose={handleClose}
                hideHeader
                ariaLabelledBy="custom-item-modal-title"
                closeOnOverlayClick={false}
                overlayClassName="hidden sm:flex fixed inset-0 z-[200] items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
                panelClassName="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                bodyClassName="contents"
            >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                                <PlusCircle size={22} aria-hidden="true" />
                            </div>
                            <h2 id="custom-item-modal-title" className="text-lg font-bold text-slate-900 uppercase tracking-tight">
                                Add Custom Item
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            aria-label="Close modal"
                        >
                            <X size={22} aria-hidden="true" />
                        </button>
                    </div>

                    {/* Event Details — aligned to column widths below */}
                    <div className="flex items-stretch border-b border-slate-100 bg-slate-50/30 shrink-0">
                        {/* Event Name — matches left 58% column */}
                        <div className="flex items-center gap-2.5 w-[58%] px-4 py-3 border-r border-slate-100">
                            <CalendarDays size={16} className="text-slate-400 shrink-0" />
                            <input
                                type="text"
                                placeholder="Event name (optional)"
                                value={eventName}
                                onChange={e => setEventName(e.target.value)}
                                className="flex-1 min-w-0 h-10 text-sm border border-slate-200 rounded-xl px-3 bg-white focus:bg-white focus:border-indigo-400 focus:outline-none text-slate-700 placeholder:text-slate-400"
                            />
                        </div>

                        {/* Event By — matches right 42% column */}
                        <div className="flex items-center gap-2.5 w-[42%] px-3 py-3 relative" ref={eventByRef}>
                            <User size={16} className="text-slate-400 shrink-0" />
                            <input
                                type="text"
                                placeholder="Event by (customer / staff)"
                                value={eventBySearch}
                                onChange={e => { setEventBySearch(e.target.value); setEventBy(e.target.value); setShowMemberDrop(true); }}
                                onFocus={() => setShowMemberDrop(true)}
                                className="flex-1 min-w-0 h-10 text-sm border border-slate-200 rounded-xl px-3 bg-white focus:bg-white focus:border-indigo-400 focus:outline-none text-slate-700 placeholder:text-slate-400"
                            />
                            {showMemberDrop && filteredMembers.length > 0 && (
                                <div className="absolute top-full left-6 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                                    {filteredMembers.map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onMouseDown={() => {
                                                setEventBy(m.name);
                                                setEventBySearch(m.name);
                                                setShowMemberDrop(false);
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-indigo-50 transition-colors text-left"
                                        >
                                            <span className="font-medium text-slate-700">{m.name}</span>
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.type === 'Staff' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                                {m.type}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-row flex-1 min-h-0 overflow-hidden">

                        {/* LEFT: Menu picker */}
                        <div className="flex flex-col w-[58%] border-r border-slate-100 min-h-0">
                            {/* Search + category */}
                            <div className="flex flex-col px-4 pt-4 pb-2 border-b border-slate-100 shrink-0">
                                <Input
                                    placeholder="Search menu items..."
                                    value={search}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                                    className="bg-slate-50 border-slate-200 focus:bg-white focus:border-indigo-500 transition-colors mb-2"
                                />
                                {categories.length > 1 && (
                                    <div className="flex gap-1.5 flex-wrap">
                                        {categories.map(cat => (
                                            <button
                                                key={cat}
                                                type="button"
                                                onClick={() => setCategoryFilter(cat)}
                                                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                                    categoryFilter === cat
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Menu grid — scrollable */}
                            <div className="flex-1 overflow-y-auto px-4 py-3">
                                {filteredItems.length === 0 ? (
                                    <p className="text-center text-slate-400 text-sm py-6">No items found</p>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        {filteredItems.map(item => (
                                            <MenuItemCard
                                                key={item.id}
                                                item={item}
                                                quantity={quantityMap.get(item.id)}
                                                onAdd={handleMenuItemClick}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT: Selected items + footer */}
                        <div className="flex flex-col w-[42%] min-h-0 bg-slate-50/50">
                            {/* Panel header */}
                            <div className="flex items-center justify-between px-3 pt-3 pb-2 shrink-0 border-b border-slate-100">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    Selected {selectedRows.length > 0 && `(${selectedRows.length})`}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleAddCustomRow}
                                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors"
                                >
                                    <Plus size={12} /> Custom
                                </button>
                            </div>

                            {/* Rows — scrollable */}
                            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                                {selectedRows.length === 0 ? (
                                    <div className="flex items-center justify-center h-full py-8">
                                        <div className="border-2 border-dashed border-slate-200 rounded-xl px-4 py-5 text-center">
                                            <p className="text-slate-400 text-xs leading-relaxed">← Tap items to<br />add them here</p>
                                        </div>
                                    </div>
                                ) : (
                                    selectedRows.map(row => renderSelectedRow(row))
                                )}
                            </div>

                            {/* Grand total */}
                            {selectedRows.length > 0 && (
                                <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between shrink-0">
                                    <span className="text-xs text-slate-500">
                                        Total · <span className="font-semibold">{selectedRows.length} item{selectedRows.length > 1 ? 's' : ''}</span>
                                    </span>
                                    <span className="text-sm font-bold text-slate-800 tabular-nums">{formatCurrency(grandTotal)}</span>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="px-3 pb-3 pt-2 flex flex-col gap-2 shrink-0">
                                <Button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                >
                                    {selectedRows.length > 0
                                        ? `Add ${selectedRows.length} item${selectedRows.length > 1 ? 's' : ''} to Cart`
                                        : 'Add to Cart'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={handleClose}
                                    className="w-full h-8 text-slate-400 font-semibold text-xs hover:bg-slate-100 hover:text-slate-600"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </form>
            </AccessibleModal>
        </>
    );
};
