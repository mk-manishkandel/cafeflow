import React, { useState, useCallback } from 'react';
import { LogIn, User, Lock, AlertCircle } from 'lucide-react';
import { API_BASE } from '../services/storageService';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { APP_NAME } from '../constants/branding';

interface LoginProps {
    onLogin: (token: string, user: any, csrfToken?: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                credentials: 'include', // Tell browser to save the set-cookie headers
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const raw = await response.json();
                // Support both new { success, data: { user, csrfToken } } and legacy flat shape
                const payload = raw.data ?? raw;
                // Tokens are now stored safely in httpOnly cookies by the browser.
                onLogin(payload.token ?? null, payload.user, payload.csrfToken);
            } else {
                let message = 'Login failed';
                try {
                    const errData = await response.json();
                    // Support both new { error: { message } } and legacy { error: string } shapes
                    message = errData.error?.message ?? errData.error ?? message;
                } catch (_) { /* non-JSON error response, use default */ }
                setError(message);
            }
        } catch (_err) {
            setError('Connection error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [username, password, onLogin]);

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                            <LogIn className="text-white w-8 h-8" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">Welcome Back</h1>
                        <p className="text-slate-500 mt-2">Sign in to {APP_NAME} to continue</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <p>{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input
                            label="Username"
                            required
                            type="text"
                            value={username}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                            placeholder="Enter your username"
                            leftIcon={<User className="text-slate-400" size={20} />}
                            autoFocus
                        />

                        <Input
                            label="Password"
                            required
                            type="password"
                            value={password}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            leftIcon={<Lock className="text-slate-400" size={20} />}
                        />

                        <Button
                            type="submit"
                            size="lg"
                            disabled={isLoading}
                            isLoading={isLoading}
                            className="w-full tracking-wide"
                        >
                            Sign In
                        </Button>
                    </form>
                </div>
                <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
                    <p className="text-xs text-slate-500">
                        Protected System &bull; Authorized Personnel Only
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
