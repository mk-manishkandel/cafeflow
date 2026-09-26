import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastContainer, ToastProps, ToastType } from './Toast';
import { GenericModal, ModalVariant } from './GenericModal';

interface ConfirmationOptions {
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: ModalVariant;
}

interface UIContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
    confirm: (options: ConfirmationOptions) => Promise<boolean>;
    alert: (message: string, title?: string) => Promise<void>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<ToastProps[]>([]);
    const [modalConfig, setModalConfig] = useState<any>(null);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info', duration = 5000) => {
        const id = crypto.randomUUID();
        setToasts(prev => [...prev, { id, message, type, onDismiss: dismissToast, duration }]);
    }, [dismissToast]);

    const confirm = useCallback((options: ConfirmationOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setModalConfig({
                isOpen: true,
                ...options,
                onConfirm: () => {
                    setModalConfig(null);
                    resolve(true);
                },
                onClose: () => {
                    setModalConfig(null);
                    resolve(false);
                }
            });
        });
    }, []);

    const alert = useCallback((message: string, title: string = 'Notification'): Promise<void> => {
        return new Promise((resolve) => {
            setModalConfig({
                isOpen: true,
                title,
                description: message,
                confirmText: 'OK',
                cancelText: '', // No cancel button for alerts
                variant: 'info',
                onConfirm: () => {
                    setModalConfig(null);
                    resolve();
                },
                onClose: () => {
                    setModalConfig(null);
                    resolve();
                }
            });
        });
    }, []);

    return (
        <UIContext.Provider value={{ showToast, confirm, alert }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            {modalConfig && <GenericModal {...modalConfig} />}
        </UIContext.Provider>
    );
};

export const useUI = () => {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
};
