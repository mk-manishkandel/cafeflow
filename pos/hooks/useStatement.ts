import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import logger from '../utils/logger';
import { getTransactions } from '../services/storageService';
import { sendBulkEmail } from '../services/setupService';
import { Transaction, Staff, Consumer } from '../types';
import { getLocalDateString, getAppTimezone, subtractMonthsClamped } from '../utils/dateUtils';
import { normalizeList } from '../components/shared/apiNormalize';
import { useUI } from '../components/ui/UIContext';

// Hard cap on rows written to a single statement export — generating an XLSX
// buffer for unbounded result sets blows memory in the worker and freezes the UI.
const MAX_EXPORT_ROWS = 20000;

interface UseStatementProps {
    type: 'STAFF' | 'CONSUMER';
    onSuccess?: (message: string) => void;
    onError?: (error: string) => void;
}

export const useStatement = ({ type, onSuccess, onError }: UseStatementProps) => {
    const { showToast } = useUI();
    const [statementEntity, setStatementEntity] = useState<Staff | Consumer | null>(null);
    const [isStatementOpen, setIsStatementOpen] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);

    // Date Range State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Email Sending State
    const [isSendDropdownOpen, setIsSendDropdownOpen] = useState(false);
    const [sendLoading, setSendLoading] = useState(false);
    const [showCustomDate, setShowCustomDate] = useState(false);
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const sendDropdownRef = useRef<HTMLDivElement>(null);

    const openStatement = useCallback(async (entity: Staff | Consumer) => {
        setStatementEntity(entity);

        setLoading(true);
        try {
            const staffId = type === 'STAFF' ? entity.id.toString() : undefined;
            const consumerId = type === 'CONSUMER' ? entity.id.toString() : undefined;
            const response = await getTransactions(undefined, undefined, undefined, staffId, consumerId);
            setTransactions(normalizeList<Transaction>(response));

            // Default to last 1 month from today (clamped so e.g. Jan 31 - 1m → Dec 31).
            const today = new Date();
            const oneMonthAgo = subtractMonthsClamped(today, 1);
            setStartDate(getLocalDateString(oneMonthAgo));
            setEndDate(getLocalDateString(today));

            setIsStatementOpen(true);
        } catch (err) {
            logger.error(err);
            if (onError) onError('Failed to fetch transactions');
        } finally {
            setLoading(false);
        }
    }, [type, onError]);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(txn => {
            if (!startDate && !endDate) return true;
            const txnDate = new Date(txn.timestamp);
            txnDate.setHours(0, 0, 0, 0);
            let startCondition = true;
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                startCondition = txnDate >= start;
            }
            let endCondition = true;
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                endCondition = txnDate <= end;
            }
            return startCondition && endCondition;
        });
    }, [transactions, startDate, endDate]);

    const sendStatementEmail = useCallback(async (duration: string, customStart?: string, customEnd?: string) => {
        if (!statementEntity) return;
        let emailStartDate = startDate;
        let emailEndDate = endDate;

        if (duration === 'custom' && customStart && customEnd) {
            emailStartDate = customStart;
            emailEndDate = customEnd;
        } else if (duration !== 'custom') {
            const today = new Date();
            emailEndDate = getLocalDateString(today);
            let start = new Date(today);
            if (duration === 'today') {
                // Start and end are both today
            } else if (duration === '7d') start.setDate(start.getDate() - 7);
            else if (duration === '15d') start.setDate(start.getDate() - 15);
            else if (duration === '1m') start = subtractMonthsClamped(today, 1);
            emailStartDate = getLocalDateString(start);
        }

        if (!emailStartDate || !emailEndDate) {
            if (onError) onError('Please select date range');
            return;
        }

        const daysDiff = Math.ceil((new Date(emailEndDate).getTime() - new Date(emailStartDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 90) {
            if (onError) onError('Date range cannot exceed 90 days');
            return;
        }

        setSendLoading(true);
        try {
            await sendBulkEmail({
                templateKey: 'email_template_statement_attachment',
                recipientIds: [statementEntity.id.toString()],
                type: type,
                params: {
                    startDate: emailStartDate,
                    endDate: emailEndDate,
                    month: new Date(emailStartDate).toLocaleString('en-US', { month: 'long' }) + ' ' + new Date(emailStartDate).getFullYear()
                }
            });
            if (onSuccess) onSuccess('Statement process started. It will be sent shortly.');
            setIsSendDropdownOpen(false);
        } catch (err: any) {
            if (onError) onError(err.message || 'Failed to send statement');
        } finally {
            setSendLoading(false);
        }
    }, [statementEntity, type, startDate, endDate, onSuccess, onError]);

    // Track the in-flight export worker so it can be terminated if the component
    // unmounts mid-export (otherwise the worker and its XLSX buffer leak).
    const exportWorkerRef = useRef<Worker | null>(null);

    useEffect(() => {
        return () => {
            exportWorkerRef.current?.terminate();
            exportWorkerRef.current = null;
        };
    }, []);

    const downloadStatementCSV = useCallback(async () => {
        if (!statementEntity) return;

        const totalRows = filteredTransactions.length;
        const truncated = totalRows > MAX_EXPORT_ROWS;
        const rowsToExport = truncated ? filteredTransactions.slice(0, MAX_EXPORT_ROWS) : filteredTransactions;
        if (truncated) {
            showToast(
                `Export limited to first ${MAX_EXPORT_ROWS.toLocaleString()} of ${totalRows.toLocaleString()} transactions — narrow the date range for full data`,
                'info'
            );
        }

        const data = rowsToExport.map(txn => ({
            'Date': new Date(txn.timestamp).toLocaleDateString(undefined, { timeZone: getAppTimezone() }),
            'Description': txn.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
            'Branch': (txn as any).branchName || 'Unknown',
            'Debit (Rs)': !txn.items.some(i => i.name.toLowerCase().includes('balance settlement')) ? txn.totalAmount : 0,
            'Credit (Rs)': txn.items.some(i => i.name.toLowerCase().includes('balance settlement')) ? txn.totalAmount : 0
        }));

        let worker: Worker | null = null;
        const terminate = () => {
            worker?.terminate();
            if (exportWorkerRef.current === worker) exportWorkerRef.current = null;
        };

        try {
            worker = new Worker(new URL('../utils/exportWorker.ts', import.meta.url), { type: 'module' });
            exportWorkerRef.current = worker;

            worker.onmessage = (e) => {
                terminate();
                if (e.data?.error) {
                    logger.error('Worker error:', e.data.error);
                    if (onError) onError('Failed to generate statement');
                    return;
                }

                try {
                    const blob = new Blob([e.data.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `statement_${statementEntity.name.replace(/\s+/g, '_')}.xlsx`;
                    link.click();
                    URL.revokeObjectURL(url);
                } catch (err) {
                    logger.error('Failed to download generated statement:', err);
                    if (onError) onError('Failed to generate statement');
                }
            };

            worker.onerror = () => {
                terminate();
                logger.error('Statement export worker crashed');
                if (onError) onError('Failed to generate statement');
            };

            worker.postMessage({
                data,
                statementEntity,
                type,
                startDate,
                endDate,
                generatedOn: new Date().toLocaleString('en-US', { timeZone: getAppTimezone() })
            });
        } catch (err) {
            terminate();
            logger.error('Error exporting statement:', err);
            if (onError) onError('Failed to start export worker');
        }
    }, [statementEntity, filteredTransactions, startDate, endDate, type, onError, showToast]);

    const closeStatement = () => {
        setIsStatementOpen(false);
        setStatementEntity(null);
        setTransactions([]);
        setStartDate('');
        setEndDate('');
        setIsSendDropdownOpen(false);
        setShowCustomDate(false);
        setCustomStartDate('');
        setCustomEndDate('');
    };

    return {
        statementEntity,
        isStatementOpen,
        openStatement,
        closeStatement,
        transactions: filteredTransactions,
        loading,
        startDate, setStartDate,
        endDate, setEndDate,
        isSendDropdownOpen, setIsSendDropdownOpen,
        sendLoading,
        showCustomDate, setShowCustomDate,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        sendStatementEmail,
        downloadStatementCSV,
        sendDropdownRef
    };
};
