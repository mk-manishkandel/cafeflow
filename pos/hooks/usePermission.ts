import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

// This hook uses the centralized AuthContext to check permissions
export const usePermission = () => {
    const { user } = useAuth();

    const can = useCallback((permission: string) => {
        if (!user) return false;

        // Admin role always has total access as a fail-safe
        if (user.role?.toLowerCase() === 'admin') return true;

        const perms = Array.isArray(user.permissions) ? user.permissions : [];
        // Support wildcard * for full access
        return perms.includes(permission) || perms.includes('*');
    }, [user]);

    return can;
};
