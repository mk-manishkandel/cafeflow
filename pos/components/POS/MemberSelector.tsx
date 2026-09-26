import React, { useMemo, useState, useEffect } from 'react';
import { User, X, ChevronDown, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import { Staff, Consumer } from '../../types';
import { Input } from '../ui/Input';

import { formatCurrency } from '../../utils/currency';
export type MemberType = (Staff | Consumer) & { memberType: 'staff' | 'consumer'; label: string };

interface MemberSelectorProps {
    staffList: Staff[];
    consumerList: Consumer[];
    selectedMember: Staff | Consumer | null;
    onSelect: (member: Staff | Consumer | null) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    isDropdownOpen: boolean;
    setIsDropdownOpen: (open: boolean) => void;
    cartTotal: number;
    dropdownRef?: React.RefObject<HTMLDivElement>;
}

export const MemberSelector: React.FC<MemberSelectorProps> = ({
    staffList,
    consumerList,
    selectedMember,
    onSelect,
    searchQuery,
    onSearchChange,
    isDropdownOpen,
    setIsDropdownOpen,
    cartTotal,
    dropdownRef
}) => {
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const allMembers: MemberType[] = useMemo(() => [
        ...staffList.map(s => ({ ...s, memberType: 'staff' as const, label: s.department })),
        ...consumerList.map(c => ({ ...c, memberType: 'consumer' as const, label: c.category || 'Consumer', department: c.category || 'Consumer' }))
    ], [staffList, consumerList]);

    const filteredMembers = useMemo(() => allMembers.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase())
    ), [allMembers, searchQuery]);

    const isOverBudget = selectedMember ? (selectedMember.currentBalance ?? 0) < cartTotal : false;

    // Keyboard navigation handler
    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (!isDropdownOpen) {
                    setIsDropdownOpen(true);
                    setHighlightedIndex(0);
                } else {
                    setHighlightedIndex(prev =>
                        prev < filteredMembers.length - 1 ? prev + 1 : prev
                    );
                }
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (isDropdownOpen) {
                    setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
                }
                break;

            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < filteredMembers.length) {
                    const member = filteredMembers[highlightedIndex];
                    onSelect(member);
                    onSearchChange(member.name);
                    setIsDropdownOpen(false);
                    setHighlightedIndex(-1);
                }
                break;

            case 'Escape':
                e.preventDefault();
                setIsDropdownOpen(false);
                setHighlightedIndex(-1);
                break;

            case 'Home':
                e.preventDefault();
                if (isDropdownOpen) {
                    setHighlightedIndex(0);
                }
                break;

            case 'End':
                e.preventDefault();
                if (isDropdownOpen) {
                    setHighlightedIndex(filteredMembers.length - 1);
                }
                break;
        }
    };

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlightedIndex >= 0 && isDropdownOpen) {
            const element = document.getElementById(`member-option-${highlightedIndex}`);
            element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [highlightedIndex, isDropdownOpen]);

    // Reset highlighted index when dropdown closes or search changes
    useEffect(() => {
        if (!isDropdownOpen) {
            setHighlightedIndex(-1);
        }
    }, [isDropdownOpen]);

    return (
        <div className="space-y-3">
            <label
                htmlFor="member-search"
                className="block text-xs font-bold uppercase text-slate-400 mb-2"
            >
                Select Member / Staff
            </label>
            <div className="relative" ref={dropdownRef}>
                <div className="relative">
                    <Input
                        id="member-search"
                        type="text"
                        placeholder="Search Staff Name..."
                        value={searchQuery}
                        onChange={(e) => {
                            onSearchChange(e.target.value);
                            setIsDropdownOpen(true);
                            setHighlightedIndex(0);
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        onKeyDown={handleKeyDown}
                        role="combobox"
                        aria-expanded={isDropdownOpen}
                        aria-controls="member-listbox"
                        aria-activedescendant={
                            highlightedIndex >= 0 ? `member-option-${highlightedIndex}` : undefined
                        }
                        aria-autocomplete="list"
                        leftIcon={<User className="text-slate-400 w-5 h-5" aria-hidden="true" />}
                        inputClassName="h-12 !text-base"
                        rightIcon={
                            searchQuery ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelect(null);
                                        onSearchChange('');
                                        setIsDropdownOpen(true);
                                    }}
                                    aria-label="Clear search"
                                    className="text-slate-400 font-bold hover:text-slate-600 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                                >
                                    <X size={18} aria-hidden="true" />
                                </button>
                            ) : (
                                <ChevronDown className="text-slate-400 w-5 h-5 pointer-events-none" aria-hidden="true" />
                            )
                        }
                    />
                </div>

                {isDropdownOpen && (
                    <div
                        id="member-listbox"
                        role="listbox"
                        aria-label="Staff and consumer members"
                        className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl max-h-60 overflow-y-auto z-[100] divide-y divide-slate-50 animate-in fade-in slide-in-from-top-2 duration-100"
                    >
                        {filteredMembers.length > 0 ? (
                            filteredMembers.map((member, index) => (
                                <div
                                    id={`member-option-${index}`}
                                    key={`${member.memberType}-${member.id}`}
                                    role="option"
                                    aria-selected={index === highlightedIndex}
                                    onClick={() => {
                                        onSelect(member);
                                        onSearchChange(member.name);
                                        setIsDropdownOpen(false);
                                        setHighlightedIndex(-1);
                                    }}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                    className={clsx(
                                        "p-3 cursor-pointer flex justify-between items-center transition-colors group",
                                        index === highlightedIndex
                                            ? "bg-indigo-50"
                                            : "hover:bg-slate-50"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={clsx(
                                            "w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 transition-colors",
                                            index === highlightedIndex && "bg-indigo-100 text-indigo-600"
                                        )}>
                                            <User size={16} aria-hidden="true" />
                                        </div>
                                        <div>
                                            <p className={clsx(
                                                "text-sm font-semibold transition-colors",
                                                index === highlightedIndex ? "text-indigo-900" : "text-slate-800"
                                            )}>
                                                {member.name}
                                            </p>
                                            <p className="text-[10px] text-slate-500 flex items-center gap-1 uppercase font-bold tracking-tight">
                                                {member.label}
                                                {member.memberType === 'consumer' && (
                                                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[10px] font-bold uppercase">Consumer</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={clsx("text-xs font-bold px-2 py-1 rounded-lg",
                                        (member.currentBalance ?? 0) < 0 ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                    )}>
                                        {formatCurrency((member.currentBalance ?? 0))}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-slate-400 text-sm" role="status">
                                <p className="font-bold">No members found</p>
                                <p className="text-xs opacity-60">Try searching for a different name</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedMember && (
                <div className={clsx("p-3 sm:p-4 rounded-xl flex items-center gap-3 border transition-all animate-in slide-in-from-left duration-100 mt-1",
                    isOverBudget
                        ? "bg-orange-50 border-orange-200 text-orange-800"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700"
                )} role="status" aria-live="polite">
                    <div className="flex-1 min-w-0 pr-2 pt-0.5">
                        <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest leading-normal mb-1">Current Account State</p>
                        <p className="text-lg sm:text-xl font-bold tabular-nums truncate">{formatCurrency((selectedMember.currentBalance ?? 0))}</p>
                    </div>
                    {isOverBudget ? (
                        <div className="text-right shrink-0">
                            <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest leading-normal mb-1">Post-Purchase</p>
                            <p className="text-sm sm:text-base font-bold text-red-600 tabular-nums">{formatCurrency(((selectedMember.currentBalance ?? 0) - cartTotal))}</p>
                        </div>
                    ) : (
                        <div className="w-10 h-10 bg-white/50 rounded-full flex items-center justify-center text-emerald-600">
                            <CheckCircle className="w-6 h-6" strokeWidth={3} aria-hidden="true" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
