import { User } from '../types';
import { API_BASE, authenticatedFetch } from './authService';
import { ApiError } from './errors';
import { getCachedData, setCachedData, clearCache } from './apiCache';
import logger from '../utils/logger';

export const getUsers = async (signal?: AbortSignal): Promise<User[]> => {
    const cacheKey = 'users';
    const cached = getCachedData<User[]>(cacheKey);
    if (cached) return cached;

    try {
        const response = await authenticatedFetch(`${API_BASE}/users`, { signal });
        if (!response.ok) throw new ApiError('Failed to fetch users', response.status);
        const json = await response.json();
        const data = Array.isArray(json) ? json : (json.data ?? []);
        setCachedData(cacheKey, data);
        return data;
    } catch (err) {
        logger.error('Failed to fetch users', err);
        throw err;
    }
};

export const getRoles = async (signal?: AbortSignal): Promise<{ name: string; permissions: string[] }[]> => {
    const cacheKey = 'roles';
    const cached = getCachedData<{ name: string; permissions: string[] }[]>(cacheKey);
    if (cached) return cached;

    try {
        const response = await authenticatedFetch(`${API_BASE}/roles`, { signal });
        if (!response.ok) throw new ApiError('Failed to fetch roles', response.status);
        const json = await response.json();
        const data = Array.isArray(json) ? json : (json.data ?? []);
        setCachedData(cacheKey, data);
        return data;
    } catch (err) {
        logger.error('Failed to fetch roles', err);
        throw err;
    }
};

export const createRole = async (role: { name: string; permissions: string[] }) => {
    const response = await authenticatedFetch(`${API_BASE}/roles`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify(role)
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create role');
    }
    clearCache('roles');
    return await response.json();
};

export const updateRole = async (name: string, permissions: string[]) => {
    const response = await authenticatedFetch(`${API_BASE}/roles/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: {},
        body: JSON.stringify({ permissions })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update role');
    }
    clearCache('roles');
};

export const deleteRole = async (name: string) => {
    const response = await authenticatedFetch(`${API_BASE}/roles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: {}
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete role');
    }
    clearCache('roles');
};

export const createUser = async (user: Partial<User> & { password?: string }) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: {},
            body: JSON.stringify(user)
        });
        if (!response.ok) throw new Error(await response.text());
        clearCache('users');
    } catch (err) {
        logger.error("Create user failed", err);
        throw err;
    }
};

export const updateUser = async (id: string, updates: Partial<User> & { password?: string }) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/users/${id}`, {
            method: 'PUT',
            headers: {},
            body: JSON.stringify(updates)
        });
        if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.error || 'Failed to update user');
        }
        clearCache('users');
    } catch (err) {
        logger.error("Update user failed", err);
        throw err;
    }
};

export const deleteUser = async (id: string) => {
    try {
        const response = await authenticatedFetch(`${API_BASE}/users/${id}`, {
            method: 'DELETE',
            headers: {}
        });
        if (!response.ok) throw new Error('Failed to delete user');
        clearCache('users');
    } catch (err) {
        logger.error("Delete user failed", err);
        throw err;
    }
};
