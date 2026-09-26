import React, { useState, useCallback } from 'react';
import { Shield, User, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/storageService';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

const SetupPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters long');
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE}/auth/setup-admin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(true);
                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            } else {
                setError(data.error || 'Setup failed');
            }
        } catch (_err) {
            setError('Connection error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [username, password, confirmPassword, navigate]);

    if (success) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="text-green-600 w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Setup Complete!</h2>
                    <p className="text-slate-600 mt-2">Admin account created successfully. Redirecting to login...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                            <Shield className="text-white w-8 h-8" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">Initial System Setup</h1>
                        <p className="text-slate-500 mt-2">Create your primary administrator account</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <p>{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input
                            label="Admin Username"
                            required
                            type="text"
                            value={username}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                            placeholder="Set admin username"
                            leftIcon={<User className="text-slate-400" size={20} />}
                        />

                        <Input
                            label="Admin Password"
                            required
                            type="password"
                            value={password}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                            placeholder="Set admin password"
                            leftIcon={<Lock className="text-slate-400" size={20} />}
                        />

                        <Input
                            label="Confirm Password"
                            required
                            type="password"
                            value={confirmPassword}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm your password"
                            leftIcon={<Lock className="text-slate-400" size={20} />}
                        />

                        <Button
                            type="submit"
                            disabled={isLoading}
                            isLoading={isLoading}
                            className="w-full py-4 text-base tracking-wide"
                        >
                            Finish Setup & Create Admin
                        </Button>
                    </form>
                </div>
                <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
                    <p className="text-xs text-slate-500">
                        This account will have full access to the entire system.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SetupPage;
