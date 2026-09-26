import React from 'react';
import { Button } from '../ui/Button';
import { AccessibleModal } from '../ui/AccessibleModal';

import { formatCurrency } from '../../utils/currency';
interface QRPaymentOverlayProps {
    /** Display name of the payment method (e.g. "eSewa", "QR Pay") */
    methodName: string;
    /** Base64 or URL string for the QR code image */
    qrData?: string | null;
    /** Formatted total to display below the QR code */
    total: number;
    /** True while the confirmation API call is in-flight */
    isProcessing: boolean;
    /** Called when the cashier taps "Confirm Received" */
    onConfirm: () => void;
    /** Called when the cashier taps "Cancel" */
    onCancel: () => void;
    /** Optional inline style overrides for the backdrop (e.g. z-index) */
    backdropStyle?: React.CSSProperties;
}

/**
 * QRPaymentOverlay
 *
 * A full-screen modal overlay that displays a QR code for the customer to scan,
 * the payable total, and Confirm / Cancel actions for the cashier.
 *
 * Shared between POS-N and TablePaymentModal to avoid JSX duplication.
 */
export const QRPaymentOverlay: React.FC<QRPaymentOverlayProps> = ({
    methodName,
    qrData,
    total,
    isProcessing,
    onConfirm,
    onCancel,
    backdropStyle,
}) => {
    return (
        <AccessibleModal
            isOpen
            onClose={onCancel}
            hideHeader
            ariaLabel="Scan to Pay"
            closeOnOverlayClick={false}
            escapeCloses={!isProcessing}
            overlayStyle={backdropStyle}
            overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            panelClassName="bg-white rounded-3xl w-full max-w-sm animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col"
            bodyClassName="contents"
        >
                {/* Header */}
                <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col items-center justify-center text-center">
                    <h3 className="font-bold text-xl text-slate-900 uppercase tracking-tight">Scan to Pay</h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
                        {methodName}
                    </p>
                </div>

                {/* QR Image */}
                <div className="p-8 flex flex-col items-center justify-center bg-white">
                    <div className="w-56 h-56 rounded-2xl border-4 border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center">
                        {qrData ? (
                            <img src={qrData} alt="Payment QR" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-slate-400 text-sm font-bold uppercase">No QR Available</span>
                        )}
                    </div>
                    <p className="mt-6 text-2xl font-bold text-indigo-600 tabular-nums tracking-tighter">
                        {formatCurrency(total)}
                    </p>
                </div>

                {/* Actions */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
                    <Button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        isLoading={isProcessing}
                        className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-lg uppercase tracking-widest transition-all"
                    >
                        Confirm Received
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        disabled={isProcessing}
                        className="w-full h-12 text-slate-500 font-bold uppercase tracking-widest text-sm"
                    >
                        Cancel
                    </Button>
                </div>
        </AccessibleModal>
    );
};
