import { Transaction, PaginatedResult } from '../types';
import { API_BASE, authenticatedFetch } from './authService';
import { ApiError } from './errors';
import { getCachedData, setCachedData, clearCache } from './apiCache';
import logger from '../utils/logger';

export const getTransactions = async (branchId?: string, startDate?: string, endDate?: string, staffId?: string, consumerId?: string, limit?: number, page?: number, search?: string, reportType?: string, userType?: string, signal?: AbortSignal): Promise<Transaction[] | { data: Transaction[], pagination: any, aggregates?: any }> => {
    try {
        const params = new URLSearchParams();
        if (branchId) params.append('branchId', branchId);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        if (staffId) params.append('staffId', staffId);
        if (consumerId) params.append('consumerId', consumerId);
        if (limit) params.append('limit', limit.toString());
        if (page) params.append('page', page.toString());
        if (search) params.append('search', search);
        if (reportType) params.append('reportType', reportType);
        if (userType) params.append('userType', userType);

        const query = params.toString() ? `?${params.toString()}` : '';
        const cacheKey = `transactions-${query}`;
        const cached = getCachedData<Transaction[] | PaginatedResult<Transaction>>(cacheKey);
        if (cached) return cached;

        const response = await authenticatedFetch(`${API_BASE}/transactions${query}`, { signal });
        if (!response.ok) throw new ApiError('Failed to fetch transactions', response.status);
        const data = await response.json();
        setCachedData(cacheKey, data);
        return data;
    } catch (err) {
        logger.error('Failed to fetch transactions', err);
        throw err;
    }
};

// IDEMPOTENCY: every saveTransaction invocation generates a fresh UUID sent as
// 'Idempotency-Key'. The server replays the cached response for a repeated key,
// so automatic transport-level retries of this same call are deduplicated.
//
// LIMITATION: the key is created per call, not per logical checkout attempt.
// A double-click that triggers two separate saveTransaction() invocations will
// still send two different keys; UI-level debounce remains necessary, and the
// server-side Redis reservation + route-level key requirement catch true
// duplicate submissions.
export const saveTransaction = async (txn: Transaction, branchId?: string, idempotencyKey?: string) => {
    try {
        const key = idempotencyKey || crypto.randomUUID();
        const response = await authenticatedFetch(`${API_BASE}/transactions`, {
            method: 'POST',
            headers: { 'Idempotency-Key': key },
            body: JSON.stringify({ ...txn, branchId })
        });
        if (!response.ok) {
            const text = await response.text();
            logger.error("saveTransaction: Failed response", { text });
            throw new Error(text || 'Transaction failed');
        }
        clearCache('transactions');
        clearCache('dashboard-stats'); // Invalidate dashboard since sales changed
    } catch (err) {
        logger.error("Transaction failed", err);
        throw err; // Re-throw to handle in UI
    }
};

export const refundTransaction = async (txnId: string, refundMethod: string) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/transactions/refund`, {
            method: 'POST',
            headers: {},
            body: JSON.stringify({ txnId, refundMethod })
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Refund failed');
        }
    } catch (err) {
        logger.error('Refund transaction failed', err);
        throw err;
    }
};

export const changeTransactionStaff = async (txnId: string, newStaffId: string) => {
    try {
        await authenticatedFetch(`${API_BASE}/transactions/change-staff`, {
            method: 'POST',
            headers: {},
            body: JSON.stringify({ txnId, newStaffId })
        });
    } catch (err) {
        logger.error('Change transaction staff failed', err);
        throw err;
    }
};
