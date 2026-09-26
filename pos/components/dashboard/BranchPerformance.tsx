import React from 'react';
import { LayoutDashboard } from 'lucide-react';

import { formatCurrency } from '../../utils/currency';
interface BranchPerformanceProps {
    branchBreakdown: any[];
}

export const BranchPerformance: React.FC<BranchPerformanceProps> = ({ branchBreakdown }) => {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-bold text-slate-800 uppercase tracking-tight text-sm">Branch Performance</h3>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch Identity</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Orders</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Revenue Yield</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {branchBreakdown.map((branch: any, idx: number) => (
                            <tr key={branch.id ?? branch.name ?? idx} className="hover:bg-indigo-50/30 transition-colors group">
                                <td className="p-4">
                                    <span className="font-bold text-slate-700 group-hover:text-indigo-900 transition-colors">{branch.name}</span>
                                </td>
                                <td className="p-4 text-right text-slate-600 font-medium">{Number(branch.count || 0).toLocaleString()}</td>
                                <td className="p-4 text-right">
                                    <span className="font-black text-slate-800 tabular-nums">{formatCurrency(Number(branch.revenue || 0))}</span>
                                </td>
                            </tr>
                        ))}
                        {branchBreakdown.length === 0 && (
                            <tr>
                                <td colSpan={3} className="py-12 text-center text-slate-400">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <LayoutDashboard className="w-8 h-8 opacity-20" />
                                    </div>
                                    <p className="text-sm font-bold opacity-60">No branch data available for this range</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
