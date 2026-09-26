import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, X, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AccessibleModal } from '../ui/AccessibleModal';

export type SecureActionVariant = 'danger' | 'warning' | 'primary';

interface SecureActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description?: string;
    itemName: string;
    isProcessing?: boolean;
    confirmKeyword?: string;
    confirmButtonText?: string;
    variant?: SecureActionVariant;
}

export const SecureActionModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description = "This action cannot be undone.",
    itemName,
    isProcessing = false,
    confirmKeyword = "DELETE",
    confirmButtonText = "Delete",
    variant = "danger"
}: SecureActionModalProps) => {
    const [confirmInput, setConfirmInput] = useState('');
    const [isValid, setIsValid] = useState(false);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            previousFocusRef.current = document.activeElement as HTMLElement;
            setConfirmInput('');
            setIsValid(false);
        } else {
            previousFocusRef.current?.focus();
        }
    }, [isOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setConfirmInput(value);
        setIsValid(value === confirmKeyword);
    };

    if (!isOpen) return null;

    const themeColors = {
        danger: {
            iconBg: 'bg-red-50',
            iconColor: 'text-red-600',
            keywordColor: 'text-red-600',
        },
        warning: {
            iconBg: 'bg-amber-50',
            iconColor: 'text-amber-600',
            keywordColor: 'text-amber-600',
        },
        primary: {
            iconBg: 'bg-indigo-50',
            iconColor: 'text-indigo-600',
            keywordColor: 'text-indigo-600',
        }
    };

    const theme = themeColors[variant];

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            hideHeader
            ariaLabelledBy="secure-action-title"
            closeOnOverlayClick={false}
            overlayClassName="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/50 animate-in fade-in"
            panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col"
            bodyClassName="contents"
        >
                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full ${theme.iconBg} flex items-center justify-center flex-shrink-0`}>
                                    {variant === 'primary' ? (
                                        <AlertTriangle className={`w-6 h-6 ${theme.iconColor}`} />
                                    ) : variant === 'warning' ? (
                                        <RefreshCw className={`w-6 h-6 ${theme.iconColor}`} />
                                    ) : (
                                        <Trash2 className={`w-6 h-6 ${theme.iconColor}`} />
                                    )}
                                </div>
                                <div>
                                    <h3 id="secure-action-title" className="text-lg font-bold text-slate-900">{title}</h3>
                                    <p className="text-sm text-slate-500 font-medium">Confirmation Required</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className={`${theme.iconBg} border border-${variant === 'danger' ? 'red' : variant === 'warning' ? 'amber' : 'indigo'}-100 rounded-xl p-4 mb-6`}>
                            <p className={`text-sm ${variant === 'danger' ? 'text-red-800' : variant === 'warning' ? 'text-amber-800' : 'text-indigo-800'} mb-2 font-medium`}>
                                {description}
                            </p>
                            <p className={`font-bold ${variant === 'danger' ? 'text-red-900' : 'text-slate-900'} break-all font-mono text-sm bg-white/50 p-2 rounded border border-white/50`}>
                                {itemName}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                                    Type <span className={theme.keywordColor}>{confirmKeyword}</span> to confirm
                                </label>
                                <Input
                                    value={confirmInput}
                                    onChange={handleInputChange}
                                    placeholder={confirmKeyword}
                                    autoFocus
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 pt-4 border-t border-slate-50 bg-slate-50/50 flex gap-3 shrink-0">
                        <Button
                            onClick={onClose}
                            variant="outline"
                            className="flex-1"
                            disabled={isProcessing}
                            size="lg"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (isValid) onConfirm();
                            }}
                            disabled={!isValid || isProcessing}
                            isLoading={isProcessing}
                            variant={variant === 'primary' ? 'primary' : variant === 'danger' ? 'danger' : 'warning'}
                            className="flex-1"
                            size="lg"
                            leftIcon={variant === 'danger' ? <Trash2 size={18} /> : <RefreshCw size={18} />}
                        >
                            {confirmButtonText}
                        </Button>
                    </div>
        </AccessibleModal>
    );
};
