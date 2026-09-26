import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, List } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
    totalItems: number;
    onShowAll?: () => void;
    isShowingAll?: boolean;
}

const Pagination: React.FC<PaginationProps> = React.memo(({
    currentPage,
    totalPages,
    onPageChange,
    itemsPerPage,
    totalItems,
    onShowAll,
    isShowingAll = false
}) => {
    const startItem = isShowingAll ? 1 : (currentPage - 1) * itemsPerPage + 1;
    const endItem = isShowingAll ? totalItems : Math.min(currentPage * itemsPerPage, totalItems);

    const pageNumbers = useMemo(() => {
        const pages: (number | string)[] = [];
        const maxVisible = 5;

        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            if (currentPage <= 3) {
                for (let i = 1; i <= 4; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 2) {
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                pages.push('...');
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            }
        }

        return pages;
    }, [currentPage, totalPages]);

    if (totalPages <= 1 && !isShowingAll) return null;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-white border-t border-slate-200 gap-4 sm:gap-0">
            {/* Info Section */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto justify-between">
                <div className="text-sm text-slate-600 text-center sm:text-left">
                    Showing <span className="font-medium mx-1">{startItem}</span> to{' '}
                    <span className="font-medium mx-1">{endItem}</span> of{' '}
                    <span className="font-medium mx-1">{totalItems}</span> transactions
                </div>

                {onShowAll && (
                    <button
                        onClick={onShowAll}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[44px] ${isShowingAll
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                            }`}
                    >
                        <List size={14} aria-hidden="true" />
                        {isShowingAll ? 'Paged' : 'Show All'}
                    </button>
                )}
            </div>

            {/* Controls Section */}
            {!isShowingAll && (
                <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
                    <button
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={18} aria-hidden="true" />
                    </button>

                    {/* Mobile: Simple "Page X of Y" */}
                    <span className="sm:hidden text-sm font-medium text-slate-700 px-2">
                        Page {currentPage} of {totalPages}
                    </span>

                    {/* Desktop: Page Numbers */}
                    <div className="hidden sm:flex items-center gap-1">
                        {pageNumbers.map((page, index) => (
                            <React.Fragment key={index}>
                                {page === '...' ? (
                                    <span className="px-3 py-2 text-slate-400">...</span>
                                ) : (
                                    <button
                                        onClick={() => onPageChange(page as number)}
                                        className={`min-w-[40px] px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === page
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    <button
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="Next page"
                    >
                        <ChevronRight size={18} aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
});

export default Pagination;
