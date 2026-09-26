import React from 'react';
import clsx from 'clsx';

interface StatItem {
    label: string;
    value: string | number;
    icon: any;
    color: string;
    trend: string;
}

interface ReportStatCardsProps {
    stats: StatItem[];
}

export const ReportStatCards: React.FC<ReportStatCardsProps> = ({ stats }) => {
    const colorMap: Record<string, { bg: string, text: string, hoverBg: string, hoverBorder: string }> = {
        indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', hoverBg: 'group-hover:bg-indigo-600', hoverBorder: 'hover:border-indigo-200' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', hoverBg: 'group-hover:bg-emerald-600', hoverBorder: 'hover:border-emerald-200' },
        blue: { bg: 'bg-blue-50', text: 'text-blue-600', hoverBg: 'group-hover:bg-blue-600', hoverBorder: 'hover:border-blue-200' },
        red: { bg: 'bg-red-50', text: 'text-red-600', hoverBg: 'group-hover:bg-red-600', hoverBorder: 'hover:border-red-200' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-600', hoverBg: 'group-hover:bg-purple-600', hoverBorder: 'hover:border-purple-200' },
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, idx) => {
                const colors = colorMap[stat.color] || colorMap.indigo;
                return (
                    <div key={stat.label ?? idx} className={clsx(
                        "bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5 group transition-all hover:shadow-md",
                        colors.hoverBorder
                    )}>
                        <div className={clsx(
                            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-sm",
                            colors.bg,
                            colors.text,
                            colors.hoverBg,
                            "group-hover:text-white"
                        )}>
                            <stat.icon size={28} />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                            <p className="text-2xl font-bold text-slate-900 leading-none mb-1">{stat.value}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight opacity-0 group-hover:opacity-100 transition-opacity">{stat.trend}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
