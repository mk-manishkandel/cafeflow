import { MenuItem, Category, PaginatedResult } from '../types';
import { API_BASE, authenticatedFetch } from './authService';
import { ApiError } from './errors';
import logger from '../utils/logger';

const _menuCache = new Map<string, { data: MenuItem[] | PaginatedResult<MenuItem>, time: number }>();
const _menuPromises = new Map<string, Promise<MenuItem[] | PaginatedResult<MenuItem>>>();

export const clearMenuCache = () => {
    _menuCache.clear();
    _menuPromises.clear();
};

export const getMenu = async (branchId?: string, page?: number, limit?: number, search?: string, sortBy?: string, sortOrder?: string, forceRefresh = false, includeUnavailable = false, signal?: AbortSignal): Promise<MenuItem[] | PaginatedResult<MenuItem>> => {
    const isSimple = !page && !limit && !search && !sortBy && !sortOrder && !includeUnavailable;
    const cacheKey = `${branchId || 'all'}${includeUnavailable ? ':all' : ''}`;

    if (isSimple && !forceRefresh) {
        if (_menuPromises.has(cacheKey)) return _menuPromises.get(cacheKey)!;
        // Removed 60s manual cache. Data must always be fresh as per user request.
    }

    const promise = (async () => {
        try {
            const params = new URLSearchParams();
            if (branchId) params.append('branchId', branchId);
            if (page) params.append('page', page.toString());
            if (limit) params.append('limit', limit.toString());
            if (search) params.append('search', search);
            if (sortBy) params.append('sortBy', sortBy);
            if (sortOrder) params.append('sortOrder', sortOrder);
            if (includeUnavailable) params.append('includeUnavailable', 'true');

            const query = params.toString() ? `?${params.toString()}` : '';
            const response = await authenticatedFetch(`${API_BASE}/menu${query}`, { signal });
            if (!response.ok) throw new ApiError('Failed to fetch menu', response.status);

            const data = await response.json();
            if (isSimple) {
                _menuCache.set(cacheKey, { data, time: Date.now() });
            }
            return data;
        } catch (err) {
            logger.error('Failed to fetch menu', err);
            throw err;
        } finally {
            if (isSimple) _menuPromises.delete(cacheKey);
        }
    })();

    if (isSimple) _menuPromises.set(cacheKey, promise);
    return promise;
};

export const addMenuItem = async (item: MenuItem, branchId?: string): Promise<MenuItem> => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/menu`, {
            method: 'POST',
            headers: {},
            body: JSON.stringify({ ...item, branchId })
        });
        if (!response.ok) throw new ApiError('Failed to add menu item', response.status);
        clearMenuCache();
        return await response.json();
    } catch (err) {
        logger.error("Add menu item failed", err);
        throw err;
    }
};

export const updateMenuItem = async (item: MenuItem, branchId?: string, updateAllBranches?: boolean) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/menu/${item.id}`, {
            method: 'PUT',
            headers: {},
            body: JSON.stringify({ ...item, branchId, updateAllBranches })
        });
        if (!response.ok) throw new ApiError('Failed to update menu item', response.status);
        clearMenuCache();
    } catch (err) {
        logger.error("Update menu item failed", err);
        throw err;
    }
};

export const deleteMenuItem = async (id: string) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/menu/${id}`, {
            method: 'DELETE',
            headers: {}
        });
        if (!response.ok) throw new ApiError('Failed to delete menu item', response.status);
        clearMenuCache();
    } catch (err) {
        logger.error("Delete menu item failed", err);
        throw err;
    }
};

export const updateTodayMenuSelection = async (itemIds: string[], isToday: boolean): Promise<number> => {
    const response = await authenticatedFetch(`${API_BASE}/menu/today-selection`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify({ itemIds, isToday })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Failed to update today menu');
    }
    clearMenuCache();
    const data = await response.json();
    return data.count as number;
};

const _catCache = new Map<string, { data: Category[], time: number }>();
const _catPromises = new Map<string, Promise<Category[]>>();

export const clearCategoryCache = () => {
    _catCache.clear();
    _catPromises.clear();
};

export const getCategories = async (branchId?: string, forceRefresh = false, signal?: AbortSignal): Promise<Category[]> => {
    const cacheKey = branchId || 'all';

    if (!forceRefresh) {
        if (_catPromises.has(cacheKey)) return _catPromises.get(cacheKey)!;
        // Removed 60s manual cache so data is always fresh.
    }

    const promise = (async () => {
        try {
            const query = branchId ? `?branchId=${branchId}` : '';
            const response = await authenticatedFetch(`${API_BASE}/categories${query}`, { signal });
            if (!response.ok) throw new ApiError('Failed to fetch categories', response.status);
            const data = await response.json();
            const mapped = data.map((d: any) => ({
                id: d.id,
                name: d.name,
                branchId: d.branch_id
            }));

            _catCache.set(cacheKey, { data: mapped, time: Date.now() });
            return mapped;
        } catch (err) {
            logger.error('Failed to fetch categories', err);
            throw err;
        } finally {
            _catPromises.delete(cacheKey);
        }
    })();

    _catPromises.set(cacheKey, promise);
    return promise;
};

export const uploadMenuImage = async (file: File): Promise<{ url: string }> => {
    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await authenticatedFetch(`${API_BASE}/upload/menu`, {
            method: 'POST',
            body: formData
            // Note: browser will set content-type to multipart/form-data for FormData
        });

        if (!response.ok) throw new ApiError('Upload menu image failed', response.status);
        return await response.json();
    } catch (err) {
        logger.error("Upload menu image failed", err);
        throw err;
    }
};

export const addCategory = async (category: Category & { branchId?: string }) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: {},
            body: JSON.stringify(category)
        });
        if (response.ok) {
            clearCategoryCache();
            clearMenuCache(); // Categories affect menu items
        }
    } catch (err) {
        logger.error("Add category failed", err);
        throw err;
    }
};

export const deleteCategory = async (id: string) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/categories/${id}`, {
            method: 'DELETE',
            headers: {}
        });
        if (response.ok) {
            clearCategoryCache();
            clearMenuCache();
        }
    } catch (err) {
        logger.error("Delete category failed", err);
        throw err;
    }
};
