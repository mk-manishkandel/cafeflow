import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, History, Clock } from 'lucide-react';
import { getLedgerEntries, LedgerEntry } from '../../../services/ledgerService';
import Pagination from '../../Pagination';
import { Button } from '../../ui/Button';
import { AccessibleModal } from '../../ui/AccessibleModal';

import { formatCurrency } from '../../../utils/currency';
interface LedgerModalProps {
    isOpen: boolean;
    onClose: () => void;
    entityType: 'STAFF' | 'CONSUMER';
    entityId: string;
    entityName: string;
}

export const LedgerModal: React.FC<LedgerModalProps> = ({ isOpen, onClose, entityType, entityId, entityName }) => {
    const [logs, setLogs] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [error, setError] = useState<string | null>(null);
    const [currentBalance, setCurrentBalance] = useState<number | null>(null);

    const fetchLedger = useCallback(async (page = 1) => {
        setLoading(true);
        setError(null);
        try {
            const response = await getLedgerEntries(entityType, entityId, page, 10);
            setLogs(response.data);
            setPagination(response.pagination);
            setCurrentBalance(response.currentBalance);
        } catch (err: any) {
            setError(err.message || 'Failed to load audit history');
        } finally {
            setLoading(false);
        }
    }, [entityType, entityId]);

    useEffect(() => {
        if (isOpen && entityId) {
            fetchLedger(1);
        }
    }, [isOpen, entityId, fetchLedger]);

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title="Balance History"
            subtitle={`${entityName}`}
            headerIcon={
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                    <History size={20} />
                </div>
            }
            maxWidth="4xl"
            footer={
                <div className="flex justify-between items-center w-full">
                    <div className="flex-1">
                        {pagination.totalPages > 1 && (
                            <Pagination
                                currentPage={pagination.page}
                                totalPages={pagination.totalPages}
                                onPageChange={fetchLedger}
                                itemsPerPage={10}
                                totalItems={pagination.total}
                            />
                        )}
                    </div>
                    <Button onClick={onClose} variant="secondary" className="shadow-none">
                        Close Statement
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col h-full space-y-6">
                {/* Stats Bar */}
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex gap-8 items-center">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider font-black text-slate-400">Total Entries</span>
                        <span className="text-sm font-bold text-slate-700">{pagination.total}</span>
                    </div>
                    <div className="w-[1px] h-8 bg-slate-200"></div>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider font-black text-slate-400">Current Balance</span>
                        <span className="text-sm font-black text-indigo-600">{formatCurrency(currentBalance)}</span>
                    </div>
                </div>

                <div className="flex-1">
                    {error ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center bg-red-50/50 rounded-2xl border border-red-100 border-dashed">
                            <AlertCircle className="w-12 h-12 text-red-500 mb-4 opacity-20" />
                            <p className="text-red-600 font-bold text-sm mb-4">{error}</p>
                            <Button
                                variant="secondary"
                                onClick={() => fetchLedger(1)}
                                className="!py-2 !px-4 text-xs"
                                leftIcon={<Clock size={14} />}
                            >
                                Retry Fetch
                            </Button>
                        </div>
                    ) : loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Fetching Logs...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                            <Clock className="w-16 h-16 text-slate-200 mb-4" />
                            <p className="text-slate-400 font-bold text-sm">No transactions found for this period.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-100 pt-1">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="bg-slate-50/80 border-b border-slate-100">
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">Date & Time</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Balance</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="border-b border-slate-50 hover:bg-indigo-50/30 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-700">{new Date(log.created_at).toLocaleDateString()}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{new Date(log.created_at).toLocaleTimeString()}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${log.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                                                    }`}>
                                                    {log.type}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-4 text-right font-black ${log.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'
                                                }`}>
                                                {log.type === 'CREDIT' ? '+' : '-'}{parseFloat(log.amount as any).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-slate-700">
                                                {formatCurrency(parseFloat(log.balance_after as any))}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 font-medium text-xs leading-relaxed max-w-xs truncate">
                                                {log.reason}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </AccessibleModal>
    );
};
