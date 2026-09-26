import React from 'react';

import { formatCurrency } from '../../utils/currency';
interface LogMetaDetailProps {
    action: string;
    metadata: any;
    onClick?: () => void;
    className?: string;
}

export const formatLogMeta = (action: string, metadata: any): string => {
    if (!metadata) return 'No details';

    switch (action) {
        case 'SEARCH':
            return `Search: ${metadata.query}`;
        case 'ADD_TO_CART':
            return `Added: ${metadata.itemName}`;
        case 'REMOVE_FROM_CART':
            return `Removed: ${metadata.itemName}`;
        case 'UPDATE_QUANTITY':
            return `Qty: ${metadata.delta > 0 ? 'Increase' : 'Decrease'}`;
        case 'INITIATE_CHECKOUT':
            return `Checkout: ${formatCurrency(metadata.cartTotal)}`;
        case 'CHECKOUT_MODAL_OPEN':
            return `Viewed Cart (Total: ${formatCurrency(metadata.total)})`;
        case 'CHECKOUT_INITIATE_START':
            return `Initiated Payment (${formatCurrency(metadata.total)})`;
        case 'CHECKOUT_SUCCESS':
            return `Payment Verified: Order ${String(metadata.orderId || '').substring(0, 8)}`;
        case 'CHECKOUT_INITIATE_ERROR':
            return `Payment Error: ${metadata.error}`;
        case 'CHECKOUT_POLL_TIMEOUT':
            return `Timed out after ${metadata.attempts} checks`;
        case 'CHECKOUT_ABANDONED':
            return `Abandoned at ${metadata.status?.toLowerCase()}`;
        case 'SESSION_START':
            return `Terminal Launched`;
        default:
            if (typeof metadata === 'object') {
                return Object.entries(metadata)
                    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1')}: ${v}`)
                    .join(', ');
            }
            return String(metadata);
    }
};

const LogMetaDetail: React.FC<LogMetaDetailProps> = ({ action, metadata, onClick, className }) => {
    const label = formatLogMeta(action, metadata);

    return (
        <div
            className={`text-xs font-bold text-slate-600 max-w-[250px] truncate ${onClick ? 'cursor-pointer hover:text-indigo-600 transition-colors' : ''} ${className}`}
            onClick={onClick}
            title={label}
        >
            {label}
        </div>
    );
};

export default React.memo(LogMetaDetail);
