import React from 'react';
import { TrendingUp } from 'lucide-react';

import { formatCurrency } from '../../utils/currency';
interface SalesBreakdownProps {
    statsByType: {
        name: string;
        revenue: number;
        count: number;
        icon: any;
        color: string;
        iconColor: string;
    }[];
}

export const SalesBreakdown: React.FC<SalesBreakdownProps> = ({ statsByType }) => {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                <span>Sales Breakdown</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statsByType.map((stat) => (
                    <div key={stat.name} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className={`p-2 rounded-lg ${stat.color} bg-opacity-10`}>
                                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.name}</span>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{formatCurrency((stat.revenue || 0))}</p>
                            <p className="text-sm text-slate-500">{stat.count || 0} Transactions</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
