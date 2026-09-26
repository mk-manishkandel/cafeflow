import React from 'react';
import { Printer, Wifi, X } from 'lucide-react';
import clsx from 'clsx';

export type PrinterMode = 'LOCAL' | 'NETWORK' | 'OFF';

interface PrinterToggleProps {
    mode: PrinterMode;
    setMode: (mode: PrinterMode) => void;
    className?: string;
}

export const PrinterToggle = ({ mode, setMode, className }: PrinterToggleProps) => {
    const cyclePrinterMode = () => {
        if (mode === 'LOCAL') setMode('NETWORK');
        else if (mode === 'NETWORK') setMode('OFF');
        else setMode('LOCAL');
    };

    return (
        <button
            onClick={cyclePrinterMode}
            className={clsx(
                "flex items-center justify-center gap-2 px-4 h-11 rounded-xl border shadow-sm transition-all active:scale-95",
                mode === 'LOCAL'   && "bg-blue-50 border-blue-200 text-blue-700",
                mode === 'NETWORK' && "bg-indigo-600 border-indigo-700 text-white",
                mode === 'OFF'     && "bg-slate-100 border-slate-200 text-slate-500",
                className
            )}
            title={`Printer: ${mode}. Click to cycle: Local > Network > Off`}
            aria-label={`Cycle printer mode. Current mode: ${mode}`}
        >
            {mode === 'LOCAL'   && <Printer size={16} aria-hidden="true" />}
            {mode === 'NETWORK' && <Wifi    size={16} aria-hidden="true" />}
            {mode === 'OFF'     && <X       size={16} aria-hidden="true" />}
            <span className="text-[10px] font-bold uppercase tracking-wider leading-none pt-[1px]">
                {mode}
            </span>
        </button>
    );
};
