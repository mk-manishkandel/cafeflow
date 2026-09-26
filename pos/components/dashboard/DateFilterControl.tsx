import React from 'react';
import { Calendar } from 'lucide-react';

interface DateFilterControlProps {
    viewMode: 'today' | 'yesterday' | 'custom';
    setViewMode: (mode: 'today' | 'yesterday' | 'custom') => void;
    customStartDate: string;
    setCustomStartDate: (date: string) => void;
    customEndDate: string;
    setCustomEndDate: (date: string) => void;
}

export const DateFilterControl: React.FC<DateFilterControlProps> = ({
    viewMode,
    setViewMode,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate
}) => {
    return (
        <div className="flex items-center gap-2">
            <div className="flex bg-slate-50 rounded-lg p-1 border border-slate-200">
                {(['today', 'yesterday'] as const).map(mode => (
                    <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === mode
                            ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                            : 'text-slate-500 hover:text-slate-900'
                            }`}
                    >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                ))}
                <button
                    onClick={() => setViewMode('custom')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${viewMode === 'custom'
                        ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                        : 'text-slate-500 hover:text-slate-900'
                        }`}
                >
                    <Calendar size={12} /> Custom
                </button>
            </div>

            {viewMode === 'custom' && (
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="px-2 h-9 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-slate-700 shadow-sm"
                    />
                    <span className="text-slate-400 text-xs font-medium">to</span>
                    <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="px-2 h-9 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-slate-700 shadow-sm"
                    />
                </div>
            )}
        </div>
    );
};
