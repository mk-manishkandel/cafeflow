import React from 'react';
import Skeleton from '../Skeleton';

export const DashboardSkeleton = () => {
    return (
        <div className="space-y-8 animate-in fade-in duration-100">
            {/* Header Skeleton */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <Skeleton width={200} height={32} className="mb-2" />
                    <Skeleton width={150} height={16} />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton width={120} height={40} className="rounded-xl" />
                    <Skeleton width={120} height={40} className="rounded-xl" />
                </div>
            </div>

            {/* Stat Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
                        <div className="flex-1">
                            <Skeleton width="60%" height={14} className="mb-2" />
                            <Skeleton width="80%" height={28} />
                        </div>
                        <Skeleton width={48} height={48} className="rounded-xl ml-4" />
                    </div>
                ))}
            </div>

            {/* Charts Grid Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="premium-card p-6">
                        <div className="flex items-center justify-between mb-8">
                            <Skeleton width={150} height={24} />
                            <Skeleton width={80} height={20} />
                        </div>
                        <div className="h-[300px] flex items-end gap-2 px-2">
                            {[...Array(12)].map((_, j) => (
                                <Skeleton
                                    key={j}
                                    width="100%"
                                    height={`${Math.random() * 60 + 20}%`}
                                    className="rounded-t-lg opacity-40"
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Grid Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 premium-card p-6">
                    <Skeleton width={180} height={24} className="mb-8" />
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 py-2">
                                <Skeleton width={40} height={40} className="rounded-lg" />
                                <div className="flex-1">
                                    <Skeleton width="40%" height={16} className="mb-1" />
                                    <Skeleton width="20%" height={12} />
                                </div>
                                <Skeleton width={60} height={16} />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="premium-card p-6">
                    <Skeleton width={150} height={24} className="mb-8" />
                    <div className="flex justify-center py-8">
                        <Skeleton width={180} height={180} circle />
                    </div>
                    <div className="space-y-3 mt-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <Skeleton width="40%" height={14} />
                                <Skeleton width="20%" height={14} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
