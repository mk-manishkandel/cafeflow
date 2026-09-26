import { Consumer, PaginatedResult } from '../types';
import { API_BASE, authenticatedFetch } from './authService';
import { ApiError } from './errors';
import { clearCache } from './apiCache';
import logger from '../utils/logger';

export const getConsumers = async (page?: number, limit?: number, search?: string, sortBy?: string, sortOrder?: string, status?: string, signal?: AbortSignal): Promise<Consumer[] | PaginatedResult<Consumer>> => {
    const params = new URLSearchParams();
    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);
    if (status) params.append('status', status);

    try {
        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await authenticatedFetch(`${API_BASE}/consumers${query}`, { signal });
        if (!response.ok) throw new ApiError('Failed to fetch consumers', response.status);
        return await response.json();
    } catch (err) {
        logger.error('Failed to fetch consumers', err);
        throw err;
    }
};

export const addConsumer = async (consumer: Consumer) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/consumers`, {
            method: 'POST',
            headers: {},
            body: JSON.stringify(consumer)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add consumer');
        }
        clearCache('consumers');
    } catch (err) {
        logger.error("Add consumer failed", err);
        throw err;
    }
};

export const updateConsumer = async (consumer: Consumer) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/consumers/${consumer.id}`, {
            method: 'PUT',
            headers: {},
            body: JSON.stringify(consumer)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update consumer');
        }
        clearCache('consumers');
    } catch (err) {
        logger.error("Update consumer failed", err);
        throw err;
    }
};

export const deleteConsumer = async (id: string) => {
    try {
        await authenticatedFetch(`${API_BASE}/consumers/${id}`, {
            method: 'DELETE',
            headers: {}
        });
        clearCache('consumers');
    } catch (err) {
        logger.error("Delete consumer failed", err);
        throw err;
    }
};
