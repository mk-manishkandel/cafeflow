import React, { useState, useEffect } from 'react';
import { Mail, Check, AlertCircle, Edit2 } from 'lucide-react';
import { getEmailConfig, updateEmailConfig, testEmailConfig } from '../../services/storageService';
import logger from '../../utils/logger';
import { Input } from '../ui/Input';

export const EmailSettings = () => {
    const [config, setConfig] = useState({
        host: '',
        port: 587,
        user: '',
        pass: '',
        from: '',
        reportRecipient: '',
        systemAdminRecipient: '',
        secure: false
    });
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await getEmailConfig();
            setConfig(data);
            // If host is empty, it means no config exists yet, so start in edit mode
            setIsEditing(!data.host);
        } catch (e: unknown) {
            logger.error('Failed to load email config', e);
            setIsEditing(true);
        } finally {
            setLoading(false);
        }
    };

    const handleTestEmail = async (e: React.MouseEvent) => {
        e.preventDefault();
        setTesting(true);
        setError('');
        setMessage('');

        // Validation for test
        if (!config.host || !config.reportRecipient) {
            setError('Host and Recipient are required for testing');
            setTesting(false);
            return;
        }

        try {
            const data = await testEmailConfig(config);
            setMessage(data.message || 'Test email sent!');
            setTimeout(() => setMessage(''), 5000);
        } catch (e: any) {
            setError(e.message || 'Network error');
        } finally {
            setTesting(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        setError('');

        try {
            await updateEmailConfig(config);
            setMessage('Email settings saved successfully!');
            setIsEditing(false);
            setTimeout(() => setMessage(''), 3000);
        } catch (e: any) {
            setError(e.message || 'Network error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Email Configuration</h3>
                    <p className="text-slate-500 text-sm mt-1">Configure SMTP settings for system emails (Notifications, Receipts).</p>
                </div>
                <div className="flex items-center gap-3">
                    {!isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition-all text-sm"
                        >
                            <Edit2 size={16} /> Edit Settings
                        </button>
                    )}
                    <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl">
                        <Mail size={28} />
                    </div>
                </div>
            </div>

            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5 relative overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative">
                    {!isEditing && (
                        <div className="absolute inset-x-[-24px] inset-y-[-24px] bg-slate-50/60 z-10 pointer-events-none"></div>
                    )}
                    <div>
                        <Input
                            label="SMTP Host"
                            required
                            disabled={!isEditing}
                            value={config.host}
                            onChange={e => setConfig({ ...config, host: e.target.value })}
                            inputClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder="smtp.gmail.com"
                        />
                    </div>
                    <div>
                        <Input
                            label="SMTP Port"
                            required
                            type="number"
                            disabled={!isEditing}
                            value={config.port}
                            onChange={e => setConfig({ ...config, port: parseInt(e.target.value) })}
                            inputClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder="587"
                        />
                    </div>
                    <div>
                        <Input
                            label="SMTP User / Email"
                            required
                            disabled={!isEditing}
                            value={config.user}
                            onChange={e => setConfig({ ...config, user: e.target.value })}
                            inputClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder="noreply@your-domain.com"
                        />
                    </div>
                    <div>
                        <Input
                            label="SMTP Password"
                            required
                            type="password"
                            disabled={!isEditing}
                            value={config.pass}
                            onChange={e => setConfig({ ...config, pass: e.target.value })}
                            inputClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none font-mono disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder="App Specific Password"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Input
                            label="From Address"
                            required
                            disabled={!isEditing}
                            value={config.from}
                            onChange={e => setConfig({ ...config, from: e.target.value })}
                            inputClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder={'"Sender Name" <email@example.com>'}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Input
                            label="System Notification Recipient"
                            required
                            disabled={!isEditing}
                            value={config.reportRecipient}
                            onChange={e => setConfig({ ...config, reportRecipient: e.target.value })}
                            inputClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder="admin@example.com (Receive system alerts/reports here)"
                        />
                        <p className="text-xs text-slate-500 mt-1">This email will receive automated staff consumption reports and system alerts.</p>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-slate-700 mb-1.5">System Admin Recipient (Bulk Status)</label>
                        <input
                            type="text"
                            disabled={!isEditing}
                            value={config.systemAdminRecipient || ''}
                            onChange={e => setConfig({ ...config, systemAdminRecipient: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            placeholder="tech-admin@example.com (Optional)"
                        />
                        <p className="text-xs text-slate-500 mt-1">This email will receive status summaries for bulk operations (e.g., Bulk Statement Sending).</p>
                    </div>
                </div>

                {message && (
                    <div className="p-3 bg-green-50 text-green-700 rounded-xl flex items-center gap-2 text-sm font-bold animate-in fade-in">
                        <Check size={16} /> {message}
                    </div>
                )}
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-xl flex items-center gap-2 text-sm font-bold animate-in fade-in">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleTestEmail}
                        disabled={loading || testing}
                        className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {testing && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        {testing ? 'Sending...' : 'Send Test Email'}
                    </button>
                    {isEditing && (
                        <button
                            type="submit"
                            disabled={loading || testing}
                            className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Settings'}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
};
