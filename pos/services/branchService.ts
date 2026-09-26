import { API_BASE, authenticatedFetch } from './authService';
import { ApiError } from './errors';
import logger from '../utils/logger';

export interface Branch {
    id: string;
    name: string;
    address: string;
    is_self_service_enabled?: boolean;
}

export const getBranches = async (signal?: AbortSignal): Promise<Branch[]> => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/branches`, { signal });
        if (!response.ok) throw new ApiError('Failed to fetch branches', response.status);
        return await response.json();
    } catch (err) {
        logger.error('Failed to fetch branches', err);
        throw err;
    }
};

export const createBranch = async (branch: Omit<Branch, 'id'>) => {
    const response = await authenticatedFetch(`${API_BASE}/branches`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify(branch),
    });
    if (!response.ok) throw new Error('Failed to create branch');
    return await response.json();
};

export const updateBranch = async (id: string, branch: Omit<Branch, 'id'>) => {
    const response = await authenticatedFetch(`${API_BASE}/branches/${id}`, {
        method: 'PUT',
        headers: {},
        body: JSON.stringify(branch),
    });
    if (!response.ok) throw new Error('Failed to update branch');
};

export const deleteBranch = async (id: string) => {
    const response = await authenticatedFetch(`${API_BASE}/branches/${id}`, {
        method: 'DELETE',
        headers: {}
    });
    if (!response.ok) throw new Error('Failed to delete branch');
};

export const getDashboardStats = async (branchId?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (branchId) params.append('branchId', branchId);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await authenticatedFetch(`${API_BASE}/dashboard/stats?${params.toString()}`, {
        headers: {}
    });

    if (!response.ok) {
        throw new Error('Failed to fetch dashboard stats');
    }
    return await response.json();
};
