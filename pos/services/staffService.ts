import { Staff, PaginatedResult, AuditLog } from '../types';
import { API_BASE, authenticatedFetch } from './authService';
import { ApiError } from './errors';
import { clearCache } from './apiCache';
import logger from '../utils/logger';

export const getStaff = async (page?: number, limit?: number, search?: string, sortBy?: string, sortOrder?: string, status?: string, signal?: AbortSignal): Promise<Staff[] | PaginatedResult<Staff>> => {
    const params = new URLSearchParams();
    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);
    if (status) params.append('status', status);

    try {
        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await authenticatedFetch(`${API_BASE}/staff${query}`, { signal });
        if (!response.ok) throw new ApiError('Failed to fetch staff', response.status);
        return await response.json();
    } catch (err) {
        logger.error('Failed to fetch staff', err);
        throw err;
    }
};

export const getAuditLogs = async (page = 1, limit = 20, search = '', startDate?: string, endDate?: string, signal?: AbortSignal): Promise<PaginatedResult<AuditLog>> => {
    try {
        const params = new URLSearchParams();
        params.append('page', page.toString());
        params.append('limit', limit.toString());
        if (search) params.append('search', search);
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const response = await authenticatedFetch(`${API_BASE}/audit-logs?${params.toString()}`, { signal });
        if (!response.ok) throw new ApiError('Failed to fetch audit logs', response.status);
        return await response.json();
    } catch (err) {
        logger.error('Failed to fetch audit logs', err);
        throw err;
    }
};


export const saveStaff = async (_staff: Staff[]) => {
    logger.warn('saveStaff (bulk) is deprecated in favor of API actions');
};

export const addStaff = async (staff: Staff) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/staff`, {
            method: 'POST',
            headers: {},
            body: JSON.stringify(staff)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add staff');
        }
        clearCache('staff');
    } catch (err) {
        logger.error("Add staff failed", err);
        throw err;
    }
};

export const updateStaff = async (staff: Staff) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/staff/${staff.id}`, {
            method: 'PUT',
            headers: {},
            body: JSON.stringify(staff)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update staff');
        }
        clearCache('staff');
    } catch (err) {
        logger.error("Update staff failed", err);
        throw err;
    }
};

export const deleteStaff = async (id: string) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/staff/${id}`, {
            method: 'DELETE',
            headers: { "Content-Type": "application/json" }
        });
        if (!response.ok) throw new Error('Failed to delete staff');
        clearCache('staff');
    } catch (err) {
        logger.error("Delete staff failed", err);
        throw err;
    }
};

export const resetAllowances = async (): Promise<Staff[]> => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/staff/reset-allowances`, {
            method: 'POST',
            headers: { 'X-Idempotency-Key': crypto.randomUUID() }
        });
        if (!response.ok) throw new ApiError('Failed to reset allowances', response.status);
        return await response.json();
    } catch (err) {
        logger.error('Failed to reset allowances', err);
        throw err;
    }
};

export const resetSingleAllowance = async (staffId: string): Promise<void> => {
    const response = await authenticatedFetch(`${API_BASE}/staff/${staffId}/reset-allowance`, {
        method: 'POST',
        headers: {}
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to reset allowance');
    }
};
