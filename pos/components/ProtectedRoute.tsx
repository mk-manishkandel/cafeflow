import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { ShieldOff, ArrowLeft } from 'lucide-react';

interface ProtectedRouteProps {
    element: React.ReactNode;
    permission?: string | string[];
}

const AccessDenied = () => {
    const navigate = useNavigate();
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-400 rounded-2xl flex items-center justify-center mb-4">
                <ShieldOff size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
            <p className="text-slate-500 mb-6 max-w-sm">
                You don't have permission to view this page. Contact your administrator if you believe this is an error.
            </p>
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
            >
                <ArrowLeft size={16} />
                Go Back
            </button>
        </div>
    );
};

// React.memo removed: ProtectedRoute receives `element` (always a new JSX reference),
// so memo never prevents re-renders and only adds overhead.
const ProtectedRoute = ({ element, permission }: ProtectedRouteProps) => {
    const can = usePermission();

    if (permission) {
        const perms = Array.isArray(permission) ? permission : [permission];
        const hasPermission = perms.some(p => can(p));
        if (!hasPermission) {
            if (can('VIEW_DASHBOARD')) return <Navigate to="/dashboard" replace />;
            if (can('ACCESS_POS')) return <Navigate to="/pos" replace />;
            return <AccessDenied />;
        }
    }

    return <>{element}</>;
};

export default ProtectedRoute;
