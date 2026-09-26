import React from 'react';
import Skeleton from '../Skeleton';

interface TableSkeletonProps {
    rows?: number;
    columns?: number;
    hasHeader?: boolean;
}

export const TableSkeleton = ({ rows = 8, columns = 5, hasHeader = true }: TableSkeletonProps) => {
    return (
        <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm animate-in fade-in duration-100">
            {hasHeader && (
                <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <Skeleton width={200} height={24} />
                    <div className="flex gap-2">
                        <Skeleton width={150} height={40} className="rounded-xl" />
                        <Skeleton width={100} height={40} className="rounded-xl" />
                    </div>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50/50">
                            {[...Array(columns)].map((_, i) => (
                                <th key={i} className="px-6 py-4">
                                    <Skeleton width="60%" height={16} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {[...Array(rows)].map((_, i) => (
                            <tr key={i}>
                                {[...Array(columns)].map((_, j) => (
                                    <td key={j} className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {j === 0 && <Skeleton width={32} height={32} className="rounded-lg shrink-0" />}
                                            <Skeleton width={j === 0 ? "70%" : "90%"} height={14} />
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-4 border-t border-slate-50 flex items-center justify-between">
                <Skeleton width={120} height={16} />
                <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} width={32} height={32} className="rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    );
};
