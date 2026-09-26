import React from 'react';
import { Zap } from 'lucide-react';
import Skeleton from '../Skeleton';

import { formatCurrency } from '../../utils/currency';
interface RevenueSourceProps {
    loading: boolean;
    statsByType: any[];
    totalRevenue: number;
}

export const RevenueSource: React.FC<RevenueSourceProps> = ({ loading, statsByType, totalRevenue }) => {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-6 uppercase tracking-tight text-sm">Revenue Source</h3>
            <div className="w-full">
                {loading ? (
                    <div className="space-y-6">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between">
                                    <Skeleton width="100px" height="16px" />
                                    <Skeleton width="60px" height="16px" />
                                </div>
                                <Skeleton width="100%" height="12px" className="rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {statsByType.length > 0 ? (
                            statsByType.map((item: any, index: number) => {
                                const percentage = totalRevenue > 0
                                    ? Math.round((item.revenue / totalRevenue) * 100)
                                    : 0;
                                const Icon = item.icon;

                                return (
                                    <div key={item.name ?? index} className="group">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${item.color.replace('bg-', 'bg-').replace('500', '50')} ${item.iconColor}`}>
                                                    <Icon size={18} />
                                                </div>
                                                <div>
                                                    <span className="text-sm font-bold text-slate-700">{item.name}</span>
                                                    <span className="text-xs text-slate-400 ml-2">{percentage}%</span>
                                                </div>
                                            </div>
                                            <span className="text-sm font-bold text-slate-900">{formatCurrency((item.revenue || 0))}</span>
                                        </div>
                                        <div className="relative h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`absolute top-0 left-0 h-full transition-all duration-1000 ease-out shadow-sm ${item.color}`}
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-12 text-center text-slate-400">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Zap className="w-8 h-8 opacity-20" />
                                </div>
                                <p className="text-sm font-bold opacity-60">No revenue source data available</p>
                            </div>
                        )}

                        {totalRevenue > 0 && (
                            <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-500 uppercase tracking-widest text-[10px]">Total Aggregate Revenue</span>
                                <span className="text-lg font-black text-indigo-600">{formatCurrency(totalRevenue)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
