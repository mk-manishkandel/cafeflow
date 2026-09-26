import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, UserCog, Printer } from 'lucide-react';
import clsx from 'clsx';
import { FixedSizeList as List } from 'react-window';
import { Transaction } from '../../../types';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../shared/EmptyState';
import { getAppTimezone } from '../../../utils/dateUtils';

import { formatCurrency } from '../../../utils/currency';
interface TransactionTableProps {
    transactions: Transaction[];
    loading: boolean;
    isMainBranch: boolean;
    onRefund: (txn: Transaction) => void;
    onChangeStaff: (txn: Transaction) => void;
    onReprint: (txn: Transaction) => void;
    canEdit: boolean;
    canRefund: boolean;
    canReprint: (txn: Transaction) => boolean;
    canRefundTxn: (txn: Transaction) => boolean;
    searchQuery: string;
}

export const TransactionTable = ({
    transactions,
    loading,
    isMainBranch,
    onRefund,
    onChangeStaff,
    onReprint,
    canEdit,
    canRefund,
    canReprint,
    canRefundTxn,
    searchQuery
}: TransactionTableProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1100);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                if (width > 0) {
                    setContainerWidth(width);
                }
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const Row = ({ index, style }: { index: number, style: React.CSSProperties }) => {
        const txn = transactions[index];
        const isRefunded = txn.status === 'REFUNDED';

        return (
            <div style={style} className={clsx(
                "flex items-center hover:bg-slate-50 transition-colors group border-b border-slate-100",
                isRefunded && "opacity-60 bg-slate-50/50"
            )}>
                <div className="w-[12%] px-6 py-4 truncate">
                    <div className="font-semibold text-slate-800 text-sm whitespace-nowrap">
                        {new Date(txn.timestamp).toLocaleDateString('en-US', { timeZone: getAppTimezone() })}
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold tracking-tight uppercase">
                        {new Date(txn.timestamp).toLocaleTimeString('en-US', { timeZone: getAppTimezone() })}
                    </div>
                </div>
                <div className="w-[10%] px-6 py-4">
                    {(txn.orderSource === 'TABLE' || txn.orderSource === 'TABLE_SPLIT' || txn.staffId === 'TABLE_ORDER') ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-100 uppercase">{txn.orderSource === 'TABLE_SPLIT' ? 'SPLIT' : 'TABLE'}</span>
                    ) : txn.staffId === 'POS-N' ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">POS-N</span>
                    ) : txn.staffId?.startsWith('COUPON_') ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">COUPON</span>
                    ) : txn.consumerId ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 uppercase">CONSUMER</span>
                    ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase">STAFF</span>
                    )}
                </div>
                <div className="w-[15%] px-6 py-4 overflow-hidden">
                    <div className="text-sm font-bold text-slate-800 truncate">{txn.staffName || 'Unknown'}</div>
                    <div className={`text-[10px] font-semibold truncate ${txn.cashierName && txn.cashierName !== 'System' ? 'text-indigo-500' : 'text-slate-400'}`}>
                        by {txn.cashierName || 'System'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">TX: {txn.id.substring(0, 8).toUpperCase()}</div>
                </div>
                {isMainBranch && (
                    <div className="w-[10%] px-6 py-4 truncate text-sm font-bold text-slate-600">
                        {(txn as any).branchName || 'CafeFlow'}
                    </div>
                )}
                <div className="flex-1 px-6 py-4 overflow-hidden">
                    <div className="flex flex-wrap gap-1">
                        {txn.items.slice(0, 3).map((item, idx) => (
                            <span key={item.id ?? item.name ?? idx} className="px-1.5 py-0.5 bg-white border border-slate-200 text-[10px] font-semibold text-slate-700 rounded whitespace-nowrap">
                                {item.quantity}× {item.name}
                            </span>
                        ))}
                        {txn.items.length > 3 && (
                            <span className="px-1.5 py-0.5 bg-slate-50 text-[10px] text-slate-500 font-bold rounded border border-slate-100">+{txn.items.length - 3}</span>
                        )}
                    </div>
                </div>
                <div className="w-[10%] px-6 py-4 text-sm font-bold text-slate-800">
                    {formatCurrency(txn.totalAmount)}
                </div>
                <div className="w-[8%] px-6 py-4">
                    <span className={clsx(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                        (txn as any).paymentMethod === 'Cash' ? "bg-green-50 text-green-700" : "bg-slate-50 text-slate-500"
                    )}>
                        {(txn as any).paymentMethod || 'N/A'}
                    </span>
                </div>
                <div className="w-[10%] px-6 py-4">
                    {isRefunded ? (
                        <div>
                            <span className="text-red-500 font-bold uppercase text-[10px]">Refunded</span>
                            {(txn as any).refundMethod && (
                                <div className="mt-0.5">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-600 border border-red-100 uppercase">
                                        {(txn as any).refundMethod}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <span className="text-emerald-500 font-bold uppercase text-[10px]">Completed</span>
                    )}
                </div>
                <div className="w-[10%] px-6 py-4 text-right">
                    {!isRefunded && !isMainBranch && (
                        <div className="flex justify-end gap-1">
                            {canEdit && (
                                <Button
                                    variant="ghost"
                                    onClick={() => onChangeStaff(txn)}
                                    className="!p-1.5 h-auto"
                                    title="Change Staff"
                                >
                                    <UserCog size={16} />
                                </Button>
                            )}
                            {canReprint(txn) && (
                                <Button
                                    variant="ghost"
                                    onClick={() => onReprint(txn)}
                                    className="!p-1.5 h-auto"
                                    title="Reprint Receipt"
                                >
                                    <Printer size={16} />
                                </Button>
                            )}
                            {canRefund && canRefundTxn(txn) && (
                                <Button
                                    variant="ghost"
                                    onClick={() => onRefund(txn)}
                                    className="!p-1.5 h-auto text-red-500 hover:text-red-600 hover:bg-red-50"
                                    title="Refund"
                                >
                                    <RotateCcw size={16} />
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (loading && transactions.length === 0) {
        return (
            <div className="py-20 flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-500 font-medium">Loading transactions...</p>
            </div>
        );
    }

    if (transactions.length === 0) {
        return (
            <div className="py-20 flex justify-center">
                <EmptyState title={searchQuery ? "No matching transactions found." : "No transactions recorded for this period."} />
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full overflow-x-auto scrollbar-hide pt-1">
            <div style={{ width: Math.max(containerWidth, 1100) }}>
                {/* Header */}
                <div className="flex items-center bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase font-bold tracking-wider leading-tight">
                    <div className="w-[12%] px-6 py-4">Time</div>
                    <div className="w-[10%] px-6 py-4">Type</div>
                    <div className="w-[15%] px-6 py-4">Individual</div>
                    {isMainBranch && <div className="w-[10%] px-6 py-4">Branch</div>}
                    <div className="flex-1 px-6 py-4">Items</div>
                    <div className="w-[10%] px-6 py-4">Amount</div>
                    <div className="w-[8%] px-6 py-4">MOP</div>
                    <div className="w-[10%] px-6 py-4">Status</div>
                    <div className="w-[10%] px-6 py-4 text-right">Actions</div>
                </div>

                {/* Virtualized List */}
                <List
                    height={600}
                    itemCount={transactions.length}
                    itemSize={80}
                    width={Math.max(containerWidth, 1100)}
                    className="scrollbar-hide"
                >
                    {Row}
                </List>
            </div>
        </div>
    );
};
