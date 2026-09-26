/**
 * User type definitions for authentication and authorization
 */

export interface User {
    id: string;
    username: string;
    role: string;
    branchId: string | null;
    permissions?: string[];
}

export interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    authorizationChecked: boolean;
    csrfToken: string | null;
    needsSetup: boolean;
    login: (user: User, csrfToken: string | null) => void;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
}
