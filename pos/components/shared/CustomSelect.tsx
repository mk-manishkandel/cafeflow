import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, LucideIcon, Search } from 'lucide-react';
import clsx from 'clsx';
import { Z_INDEX } from '../../constants/zIndex';

interface Option {
    value: string;
    label: string;
    icon?: LucideIcon;
    description?: string;
}

interface CustomSelectProps {
    value: string | string[];
    onChange: (value: any) => void;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    error?: boolean;
    label?: React.ReactNode;
    required?: boolean;
    isMulti?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    disabled = false,
    className = '',
    error = false,
    label,
    required = false,
    isMulti = false,
    searchable = true,
    searchPlaceholder = 'Search...'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [openUpward, setOpenUpward] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, minWidth: 240 });
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Stable IDs for ARIA linkage across the Portal boundary
    const uid = useId();
    const listboxId = `listbox-${uid.replace(/:/g, '')}`;

    const selectedOption = !isMulti
        ? options.find(opt => opt.value === value)
        : null;

    const selectedValues = isMulti ? (Array.isArray(value) ? value : [value]) : [];

    // Filter options based on search query
    const filteredOptions = searchable && searchQuery
        ? options.filter(opt =>
            opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (opt.description && opt.description.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        : options;

    // Calculate dropdown position
    const updateDropdownPosition = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const shouldOpenUpward = spaceBelow < 300 && spaceAbove > spaceBelow;

            // Ensure dropdown minimum width
            const width = Math.max(rect.width, 240);

            // Calculate horizontal position to keep it on screen
            let left = rect.left;

            // If it would overflow right side
            if (left + width > window.innerWidth - 10) {
                left = window.innerWidth - width - 10;
            }

            // If it would overflow left side (especially near sidebar)
            if (left < 10) {
                left = 10;
            }

            setOpenUpward(shouldOpenUpward);
            setDropdownPosition({
                top: shouldOpenUpward ? rect.top : rect.bottom,
                left: left,
                width: rect.width,
                minWidth: width
            });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updateDropdownPosition();

            let rafId: number;
            // Update position on scroll/resize with requestAnimationFrame to prevent layout thrashing
            const handleUpdate = () => {
                cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    updateDropdownPosition();
                });
            };

            window.addEventListener('scroll', handleUpdate, true);
            window.addEventListener('resize', handleUpdate);

            return () => {
                cancelAnimationFrame(rafId);
                window.removeEventListener('scroll', handleUpdate, true);
                window.removeEventListener('resize', handleUpdate);
            };
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            if (searchable && searchInputRef.current) {
                // Focus search input when searchable dropdown opens
                setTimeout(() => searchInputRef.current?.focus(), 50);
            } else {
                // Auto-focus selected option or first option when no search
                const selectedIdx = filteredOptions.findIndex(opt =>
                    isMulti ? selectedValues.includes(opt.value) : opt.value === value
                );
                const targetIdx = selectedIdx >= 0 ? selectedIdx : 0;
                setFocusedIndex(targetIdx);
                setTimeout(() => optionRefs.current[targetIdx]?.focus(), 50);
            }
        }

        // Clear search and focus index when closing
        if (!isOpen) {
            setSearchQuery('');
            setFocusedIndex(-1);
        }
    }, [isOpen, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle click outside for both the container and dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            setIsOpen(prev => !prev);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
        } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isOpen) {
            e.preventDefault();
            setIsOpen(true);
        }
    }, [disabled, isOpen]);

    const handleOptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, optValue: string, index: number) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSelect(optValue);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIdx = Math.min(index + 1, filteredOptions.length - 1);
            setFocusedIndex(nextIdx);
            optionRefs.current[nextIdx]?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (index === 0 && searchable && searchInputRef.current) {
                searchInputRef.current.focus();
            } else {
                const prevIdx = Math.max(index - 1, 0);
                setFocusedIndex(prevIdx);
                optionRefs.current[prevIdx]?.focus();
            }
        } else if (e.key === 'Tab') {
            setIsOpen(false);
        }
    }, [filteredOptions.length, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSelect = (optValue: string) => {
        if (isMulti) {
            const newValue = selectedValues.includes(optValue)
                ? selectedValues.filter(v => v !== optValue)
                : [...selectedValues, optValue];
            onChange(newValue);
        } else {
            onChange(optValue);
            setIsOpen(false);
        }
    };

    const dropdownContent = isOpen && (
        <div
            ref={dropdownRef}
            style={{
                position: 'fixed',
                top: openUpward ? 'auto' : dropdownPosition.top + 8,
                bottom: openUpward ? window.innerHeight - dropdownPosition.top + 8 : 'auto',
                left: dropdownPosition.left,
                width: dropdownPosition.width,
                minWidth: dropdownPosition.minWidth,
                zIndex: Z_INDEX.POPOVER,
                opacity: dropdownPosition.width === 0 ? 0 : 1,
                pointerEvents: dropdownPosition.width === 0 ? 'none' : 'auto'
            }}
            className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden transition-opacity duration-200"
        >
            {/* Search Input */}
            {searchable && (
                <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder={searchPlaceholder}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') { e.preventDefault(); setIsOpen(false); }
                                else if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setFocusedIndex(0);
                                    optionRefs.current[0]?.focus();
                                }
                            }}
                            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}

            <div
                id={listboxId}
                role="listbox"
                aria-label={typeof label === 'string' ? label : placeholder}
                aria-multiselectable={isMulti}
                className="max-h-56 overflow-y-auto p-1.5 custom-scrollbar"
            >
                {filteredOptions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-slate-400">
                        No options found
                    </div>
                ) : (
                    filteredOptions.map((option, index) => {
                        const isSelected = isMulti
                            ? selectedValues.includes(option.value)
                            : option.value === value;
                        const Icon = option.icon;
                        return (
                            <button
                                key={option.value}
                                ref={el => { optionRefs.current[index] = el; }}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                tabIndex={focusedIndex === index ? 0 : -1}
                                onClick={() => handleSelect(option.value)}
                                onKeyDown={(e) => handleOptionKeyDown(e, option.value, index)}
                                className={clsx(
                                    "w-full px-3 py-2 rounded-lg text-left flex items-center justify-between gap-3 transition-all duration-200",
                                    isSelected
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-indigo-600"
                                )}
                            >
                                <div className="flex items-center gap-3 truncate">
                                    {Icon && (
                                        <Icon size={18} className={clsx(
                                            "shrink-0",
                                            isSelected ? "text-indigo-600" : "text-slate-400"
                                        )} />
                                    )}
                                    <div className="flex flex-col truncate">
                                        <span className={clsx(
                                            "text-sm font-semibold",
                                            isSelected && "text-indigo-700"
                                        )}>
                                            {option.label}
                                        </span>
                                        {option.description && (
                                            <span className={clsx(
                                                "text-[10px] truncate leading-tight uppercase tracking-wider font-bold",
                                                isSelected ? "text-indigo-500" : "text-slate-400"
                                            )}>
                                                {option.description}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {isSelected && (
                                    <div className="bg-indigo-600 p-1 rounded-full shrink-0 shadow-sm shadow-indigo-200">
                                        <Check size={12} className="text-white" strokeWidth={4} />
                                    </div>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div ref={containerRef} className={clsx("relative w-full h-full", className)}>
            {label && (
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 ml-1">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <button
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleTriggerKeyDown}
                disabled={disabled}
                className={clsx(
                    "w-full h-10 px-4 py-2 text-left border rounded-lg transition-all duration-200 flex items-center justify-between gap-3 shadow-sm",
                    "focus:border-indigo-500 outline-none",
                    disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200" :
                        error ? "bg-white border-red-300 hover:border-red-400 text-red-900" :
                            "bg-white border-slate-200 hover:border-slate-300 text-slate-700",
                    isOpen && "border-indigo-500"
                )}
            >
                <div className="flex items-center gap-3 truncate">
                    {selectedOption?.icon && (
                        <selectedOption.icon size={18} className={clsx(
                            "shrink-0",
                            isOpen ? "text-indigo-600" : "text-slate-400"
                        )} />
                    )}
                    <span className={clsx(
                        "truncate text-sm font-medium",
                        (!selectedOption && !isMulti) && "text-slate-400",
                        (isMulti && selectedValues.length === 0) && "text-slate-400"
                    )}>
                        {isMulti
                            ? (selectedValues.length === 0
                                ? placeholder
                                : selectedValues.length === options.length
                                    ? 'All Selected'
                                    : `${selectedValues.length} Selected`)
                            : (selectedOption?.label || placeholder)}
                    </span>
                </div>
                <ChevronDown
                    size={18}
                    className={clsx(
                        "shrink-0 text-slate-400 transition-transform duration-300 ease-out",
                        isOpen && "rotate-180 text-indigo-600"
                    )}
                />
            </button>

            {/* Render dropdown via Portal to escape overflow:hidden containers */}
            {dropdownContent && createPortal(dropdownContent, document.body)}
        </div>
    );
};

export default CustomSelect;
