import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
    id: string;
    message: string;
    type: ToastType;
    onDismiss: (id: string) => void;
    duration?: number;
}

export const Toast = ({ id, message, type, onDismiss, duration = 5000 }: ToastProps) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(id);
        }, duration);

        return () => clearTimeout(timer);
    }, [id, duration, onDismiss]);

    const variants = {
        success: {
            bg: 'bg-white',
            accent: 'bg-emerald-500',
            text: 'text-slate-800',
            icon: <CheckCircle className="w-5 h-5 text-emerald-500" aria-hidden="true" />,
            progress: 'bg-emerald-500'
        },
        error: {
            bg: 'bg-white',
            accent: 'bg-red-500',
            text: 'text-slate-800',
            icon: <AlertCircle className="w-5 h-5 text-red-500" aria-hidden="true" />,
            progress: 'bg-red-500'
        },
        info: {
            bg: 'bg-white',
            accent: 'bg-indigo-500',
            text: 'text-slate-800',
            icon: <Info className="w-5 h-5 text-indigo-500" aria-hidden="true" />,
            progress: 'bg-indigo-500'
        }
    };

    const variant = variants[type];

    return (
        <div 
            role="alert"
            aria-live="polite"
            className={`
            relative flex items-center gap-3 w-full max-w-sm p-4 pl-5 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden
            ${variant.bg}
            animate-in slide-in-from-right-full fade-in duration-100
        `}>
            {/* Left accent strip */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${variant.accent}`} />

            <div className="flex-shrink-0">
                {variant.icon}
            </div>
            <p className={`flex-1 text-sm font-medium ${variant.text}`}>{message}</p>
            <button
                onClick={() => onDismiss(id)}
                aria-label="Dismiss notification"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
                <X size={14} aria-hidden="true" />
            </button>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 h-0.5 bg-slate-100 w-full">
                <div
                    className={`h-full ${variant.progress} opacity-60`}
                    style={{
                        width: '100%',
                        animation: `linear-progress ${duration}ms linear forwards`
                    }}
                />
            </div>
            <style>{`
                @keyframes linear-progress {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `}</style>
        </div>
    );
};

export const ToastContainer = ({ toasts, onDismiss }: { toasts: ToastProps[], onDismiss: (id: string) => void }) => {
    return (
        <div className="fixed top-4 right-2 left-2 sm:left-auto sm:right-4 z-[3000] flex flex-col gap-2 w-auto sm:w-full sm:max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden pointer-events-none">
            {toasts.map(toast => (
                <div key={toast.id} className="pointer-events-auto">
                    <Toast {...toast} onDismiss={onDismiss} />
                </div>
            ))}
        </div>
    );
};
