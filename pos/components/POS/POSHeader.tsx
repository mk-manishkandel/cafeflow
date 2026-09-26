import React, { memo } from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface POSHeaderProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    categoryFilter: string;
    setCategoryFilter: (category: string) => void;
    categoryNames: string[];
    onAddCustomItemClick?: () => void;
}

export const POSHeader = memo(({
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    categoryNames,
    onAddCustomItemClick,
}: POSHeaderProps) => {
    return (
        <div className="p-4 border-b border-slate-100 space-y-4">
            <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                    <Input
                        type="text"
                        placeholder="Search menu items..."
                        value={searchQuery}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                        leftIcon={<Search className="text-slate-400 w-5 h-5" />}
                        inputClassName="h-12 !text-base"
                    />
                </div>
                {onAddCustomItemClick && (
                    <Button
                        onClick={onAddCustomItemClick}
                        aria-label="Add custom item"
                        className="h-12 px-4 flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus-circle" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                        <span className="hidden sm:inline font-bold uppercase tracking-widest text-xs">Custom Item</span>
                    </Button>
                )}
            </div>
            <div className="flex gap-2 overflow-x-auto pt-1 pb-2 scrollbar-hide" role="tablist" aria-label="Category filters">
                {categoryNames.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setCategoryFilter(cat);
                            }
                        }}
                        role="tab"
                        aria-selected={categoryFilter === cat}
                        aria-label={`Filter by ${cat} category`}
                        tabIndex={categoryFilter === cat ? 0 : -1}
                        className={clsx(
                            "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                            categoryFilter === cat ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                    >
                        {cat}
                    </button>
                ))}
            </div>
        </div>
    );
});
