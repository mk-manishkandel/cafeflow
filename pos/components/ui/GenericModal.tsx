import React from 'react';
import { X, AlertTriangle, CheckCircle, Info, Trash2 } from 'lucide-react';
import { AccessibleModal } from './AccessibleModal';

export type ModalVariant = 'success' | 'danger' | 'warning' | 'info';

interface GenericModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title?: string;
    description?: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: ModalVariant;
    isLoading?: boolean;
    /** Custom content: when provided (without description/onConfirm) GenericModal
     *  acts as a pure dialog shell so other primitives can delegate to it. */
    children?: React.ReactNode;
    /** Replaces the default overlay classes (visual-preserving migrations). */
    overlayClassName?: string;
    /** Replaces the default panel classes (visual-preserving migrations). */
    className?: string;
    closeOnOverlayClick?: boolean;
    ariaLabel?: string;
}

const DEFAULT_OVERLAY_CLASSNAME =
    "fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100";

const DEFAULT_PANEL_CLASSNAME =
    "bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-100 flex flex-col max-h-[80vh]";

export const GenericModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "info",
    isLoading = false,
    children,
    overlayClassName,
    className,
    closeOnOverlayClick = false,
    ariaLabel
}: GenericModalProps) => {
    const themeColors = {
        success: {
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-600',
            button: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
            icon: CheckCircle
        },
        danger: {
            iconBg: 'bg-red-50',
            iconColor: 'text-red-600',
            button: 'bg-red-600 hover:bg-red-700 shadow-red-200',
            icon: Trash2
        },
        warning: {
            iconBg: 'bg-amber-50',
            iconColor: 'text-amber-600',
            button: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200',
            icon: AlertTriangle
        },
        info: {
            iconBg: 'bg-indigo-50',
            iconColor: 'text-indigo-600',
            button: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200',
            icon: Info
        }
    } as const;

    const isShellMode = children !== undefined && description === undefined && onConfirm === undefined;

    if (!isOpen) return null;

    const ThemeIcon = themeColors[variant].icon;
    const theme = themeColors[variant];

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            hideHeader
            ariaLabel={ariaLabel ?? title}
            overlayClassName={overlayClassName ?? DEFAULT_OVERLAY_CLASSNAME}
            panelClassName={className ?? DEFAULT_PANEL_CLASSNAME}
            bodyClassName="contents"
            closeOnOverlayClick={closeOnOverlayClick}
        >
            {isShellMode ? (
                children
            ) : (
                <>
                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                        <div className="flex items-start justify-between mb-5">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full ${theme.iconBg} flex items-center justify-center flex-shrink-0`}>
                                    <ThemeIcon className={`w-6 h-6 ${theme.iconColor}`} />
                                </div>
                                <div>
                                    <h3 id="modal-title" className="text-lg font-bold text-slate-900 leading-tight">{title}</h3>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                aria-label="Close modal"
                                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100"
                            >
                                <X size={20} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="text-slate-600 text-sm leading-relaxed ml-16">
                            {description}
                        </div>
                    </div>

                    <div className="p-6 pt-0 flex gap-3 justify-end">
                        {cancelText && (
                            <button
                                onClick={onClose}
                                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors"
                                disabled={isLoading}
                            >
                                {cancelText}
                            </button>
                        )}
                        {onConfirm && (
                            <button
                                onClick={onConfirm}
                                disabled={isLoading}
                                className={`px-4 py-2.5 ${theme.button} text-white rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all min-w-[100px]`}
                            >
                                {isLoading ? (
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    confirmText
                                )}
                            </button>
                        )}
                    </div>
                </>
            )}
        </AccessibleModal>
    );
};
