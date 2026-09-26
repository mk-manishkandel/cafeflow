import React from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    ariaLabel?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    placeholder = "Search...",
    className,
    ariaLabel
}) => {
    return (
        <div className={clsx("relative w-full max-w-md", className)}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
            <input
                type="text"
                placeholder={placeholder}
                aria-label={ariaLabel || placeholder}
                className="w-full pl-10 pr-4 h-11 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm shadow-sm"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
};
