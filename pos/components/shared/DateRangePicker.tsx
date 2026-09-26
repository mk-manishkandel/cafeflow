import React from 'react';
import { Calendar, Filter } from 'lucide-react';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onStartDateChange: (value: string) => void;
    onEndDateChange: (value: string) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange
}) => {
    return (
        <div className="flex h-11 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
            <div className="flex items-center gap-2 px-3 border-r border-slate-100 bg-slate-50/50">
                <Calendar size={14} className="text-slate-400" />
                <input
                    type="date"
                    value={startDate}
                    onChange={e => onStartDateChange(e.target.value)}
                    className="relative text-xs font-bold text-black focus:outline-none bg-transparent w-28 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-30 [&::-webkit-calendar-picker-indicator]:hover:opacity-70 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer cursor-pointer"
                />
            </div>
            <div className="flex items-center gap-2 px-3">
                <Filter size={14} className="text-slate-400" />
                <input
                    type="date"
                    value={endDate}
                    onChange={e => onEndDateChange(e.target.value)}
                    className="relative text-xs font-bold text-black focus:outline-none bg-transparent w-28 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-30 [&::-webkit-calendar-picker-indicator]:hover:opacity-70 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer cursor-pointer"
                />
            </div>
        </div>
    );
};
