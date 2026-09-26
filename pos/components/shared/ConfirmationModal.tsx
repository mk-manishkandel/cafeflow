import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { GenericModal } from '../ui/GenericModal';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger'
}) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            await onConfirm();
        } finally {
            setIsLoading(false);
        }
    };

    const variantStyles = {
        danger: {
            bg: 'bg-red-50',
            icon: 'text-red-600',
            button: 'danger'
        },
        warning: {
            bg: 'bg-amber-50',
            icon: 'text-amber-600',
            button: 'warning'
        },
        info: {
            bg: 'bg-indigo-50',
            icon: 'text-indigo-600',
            button: 'primary'
        }
    };

    const styles = variantStyles[variant];

    return (
        <GenericModal
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel={title}
            overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
            closeOnOverlayClick
        >
            <div className="p-8 text-center">
                <div className={`mx-auto w-16 h-16 ${styles.bg} rounded-2xl flex items-center justify-center ${styles.icon} mb-6`}>
                    <AlertTriangle size={32} aria-hidden="true" />
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-2 uppercase tracking-tight">
                    {title}
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-8">
                    {message}
                </p>

                <div className="grid grid-cols-2 gap-4">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="w-full h-12 rounded-xl font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={styles.button as any}
                        onClick={handleConfirm}
                        disabled={isLoading}
                        isLoading={isLoading}
                        className="w-full h-12 rounded-xl font-bold uppercase tracking-widest shadow-lg"
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </GenericModal>
    );
};
