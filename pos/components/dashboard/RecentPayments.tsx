import React, { useState, useMemo } from 'react';
import { CreditCard, Users, UserCheck, Zap } from 'lucide-react';

import { formatCurrency } from '../../utils/currency';
interface RecentPayment {
    id: string;
    date: string;
    amount: number;
    mop: string;
    type: 'Staff' | 'Consumer' | 'POS-N' | 'Settlement';
    branch: string | null;
}

interface RecentPaymentsProps {
    recentPayments: RecentPayment[];
    isMainBranch: boolean;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; bg: string; text: string; label: string }> = {
    Staff:           { icon: Users,            bg: 'bg-emerald-100', text: 'text-emerald-600', label: 'Staff' },
    Consumer:        { icon: UserCheck,        bg: 'bg-blue-100',    text: 'text-blue-600',    label: 'Consumer' },
    'POS-N':         { icon: Zap,              bg: 'bg-indigo-100',  text: 'text-indigo-600',  label: 'POS-N' },
};

export const RecentPayments: React.FC<RecentPaymentsProps> = ({ recentPayments, isMainBranch }) => {
    const [activeMOP, setActiveMOP] = useState<string>('All');

    const formatDateTime = (iso: string) => {
        const d = new Date(iso);
        const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        return { date, time };
    };

    // Derive unique MOP tabs from the data, preserving insertion order
    const mopTabs = useMemo(() => {
        const seen = new Set<string>();
        const tabs: string[] = ['All'];
        recentPayments.forEach(p => {
            const key = (p.mop || 'Unknown').trim();
            if (!seen.has(key)) { seen.add(key); tabs.push(key); }
        });
        return tabs;
    }, [recentPayments]);

    const filtered = useMemo(() =>
        activeMOP === 'All'
            ? recentPayments
            : recentPayments.filter(p => (p.mop || 'Unknown').trim() === activeMOP),
        [recentPayments, activeMOP]
    );

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-bold text-slate-800 uppercase tracking-tight text-sm">Recent Payments</h3>
                    </div>
                    {/* MOP filter tabs */}
                    {mopTabs.length > 1 && (
                        <div className="flex items-center gap-1 flex-wrap">
                            {mopTabs.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveMOP(tab)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                                        activeMOP === tab
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date / Time</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                            {isMainBranch && (
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                            )}
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">MOP</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtered.map((p) => {
                            const { date, time } = formatDateTime(p.date);
                            const cfg = TYPE_CONFIG[p.type] || TYPE_CONFIG.Staff;
                            const Icon = cfg.icon;
                            return (
                                <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-semibold text-slate-700">{date}</p>
                                        <p className="text-xs text-slate-400 font-medium">{time}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                                            <Icon className="w-3 h-3" />
                                            {cfg.label}
                                        </span>
                                    </td>
                                    {isMainBranch && (
                                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">{p.branch || '—'}</td>
                                    )}
                                    <td className="px-6 py-4 text-sm text-slate-600 font-medium capitalize">{p.mop}</td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="font-black text-slate-800 tabular-nums">{formatCurrency(Number(p.amount || 0))}</span>
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={isMainBranch ? 5 : 4} className="py-12 text-center text-slate-400">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CreditCard className="w-8 h-8 opacity-20" />
                                    </div>
                                    <p className="text-sm font-bold opacity-60">No payments in this period</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
