import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Building2, Store, Search, X, Check, Key, Copy, AlertTriangle, Shield } from 'lucide-react';
import { getApiKeys, generateApiKey, revokeApiKey, getBranches } from '../../services/storageService';
import { AccessibleModal } from '../ui/AccessibleModal';
import { getAppTimezone } from '../../utils/dateUtils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface ApiKey {
    id: string;
    name: string;
    prefix: string;
    branch_id: string | null;
    scope: string | null;
    created_at: string;
    last_used_at: string | null;
    created_by_name: string | null;
}

interface Branch {
    id: string;
    name: string;
}

import { useUI } from '../../components/ui/UIContext';
import logger from '../../utils/logger';

export const ApiKeyManager = () => {
    const { confirm, showToast } = useUI();
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [selectedBranchId, setSelectedBranchId] = useState<string>(''); // Empty for Global
    const [branchSearch, setBranchSearch] = useState('');
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [error, setError] = useState('');

    const loadData = async () => {
        try {
            const [keysData, branchesData] = await Promise.all([
                getApiKeys(),
                getBranches()
            ]);

            setKeys(keysData);
            setBranches(branchesData);

        } catch (err: unknown) {
            logger.error('Failed to load API key data', err);
            showToast('Failed to load API keys', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const data = await generateApiKey(newKeyName, selectedBranchId || null, 'full');
            setGeneratedKey(data.key); // Show the full key
            setNewKeyName('');
            setSelectedBranchId('');
            setIsGenerating(false);
            loadData();
            showToast('API Key generated successfully', 'success');
        } catch (err: any) {
            setError(err.message || 'Network error');
            showToast(err.message || 'Failed to generate key', 'error');
        }
    };

    const handleRevoke = async (id: string) => {
        if (!await confirm({
            title: 'Revoke API Key',
            description: 'Are you sure you want to revoke this API Key? This action cannot be undone.',
            confirmText: 'Revoke',
            variant: 'danger'
        })) return;

        try {
            await revokeApiKey(id);
            loadData();
            showToast('API Key revoked successfully', 'success');
        } catch (_err: unknown) {
            showToast('Failed to revoke key', 'error');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    };

    if (loading && keys.length === 0) {
        return <div className="p-8 text-center text-slate-500">Loading API keys...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">API Keys</h3>
                    <p className="text-slate-500 text-sm">Manage access keys for external applications (e.g. Printer Server).</p>
                </div>
                <Button
                    onClick={() => setIsGenerating(true)}
                    leftIcon={<Plus size={16} />}
                >
                    Generate Key
                </Button>
            </div>

            {/* List Keys */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Access</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[120px]">Key Prefix</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[100px]">Status</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Generated By</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Created</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {keys.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-slate-400">
                                        No API Keys found. Generate one to get started.
                                    </td>
                                </tr>
                            ) : (
                                keys.map(key => (
                                    <tr key={key.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 font-bold text-slate-700">{key.name}</td>
                                        <td className="p-4">
                                            {key.branch_id ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                    <Store size={12} />
                                                    {branches.find(b => b.id === key.branch_id)?.name || 'Unknown Branch'}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                                    <Building2 size={12} />
                                                    System Wide
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {key.scope === 'full' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                    Full Access
                                                </span>
                                            ) : key.scope === 'reports' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-100">
                                                    Read-Only (Reports)
                                                </span>
                                            ) : key.scope === 'staff,consumer' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100">
                                                    Staff &amp; Consumers
                                                </span>
                                            ) : key.scope ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-100">
                                                    {key.scope}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-100" title="No scope set — this key is rejected on every permission-checked route. Revoke and regenerate.">
                                                    No Scope (Inactive)
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className="font-mono text-[11px] text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1">
                                                {key.prefix}...
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Active
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 font-medium">
                                            {key.created_by_name || 'System'}
                                        </td>
                                        <td className="p-4 text-sm text-slate-500">{new Date(key.created_at).toLocaleDateString('en-US', { timeZone: getAppTimezone() })}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-1.5">
                                                <button
                                                    onClick={() => handleRevoke(key.id)}
                                                    className="p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
                                                    title="Revoke Key"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Generate Key Modal */}
            <AccessibleModal
                isOpen={isGenerating}
                onClose={() => setIsGenerating(false)}
                hideHeader
                ariaLabel="Generate New API Key"
                closeOnOverlayClick={false}
                overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden max-h-[80vh]"
            >
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                                        <Shield size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800">Generate New API Key</h3>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Security & Access</p>
                                    </div>
                                </div>
                                <Button variant="ghost" onClick={() => setIsGenerating(false)} className="!p-2 bg-transparent">
                                    <X size={20} />
                                </Button>
                            </div>
                            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                                <form onSubmit={handleGenerate} className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Key Name <span className="text-red-500">*</span></label>
                                        <Input
                                            required
                                            type="text"
                                            value={newKeyName}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKeyName(e.target.value)}
                                            placeholder="e.g. Printer Server - Main Kitchen"
                                        />
                                    </div>

                                    <div className="flex items-start gap-3 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
                                        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600 shrink-0">
                                            <Shield size={18} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-slate-700">Full Access</p>
                                            <p className="text-xs opacity-70">
                                                Read dashboard, staff, consumers, transactions (incl. consumption &amp;
                                                item sales reports), menu, and account statements. Create, edit, and
                                                deactivate staff &amp; consumers. It&apos;s on the integrating system to use
                                                this appropriately — CafeFlow doesn&apos;t restrict read vs. write per key.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Branch</label>

                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <input
                                                type="text"
                                                placeholder="Search branches..."
                                                value={branchSearch}
                                                onChange={e => setBranchSearch(e.target.value)}
                                                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:border-indigo-500 outline-none mb-2"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                                            {/* Global Option - Only show if it matches search or search is empty */}
                                            {('System Wide / Global'.toLowerCase().includes(branchSearch.toLowerCase()) || branchSearch === '') && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedBranchId('')}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedBranchId === ''
                                                        ? 'bg-indigo-50 border-indigo-500 shadow-md'
                                                        : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'
                                                        }`}
                                                >
                                                    <div className={`p-2 rounded-lg ${selectedBranchId === '' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        <Building2 size={20} />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm">System Wide / Global</p>
                                                        <p className="text-xs opacity-70">Access to all branch data</p>
                                                    </div>
                                                    {selectedBranchId === '' && <Check size={18} className="ml-auto text-indigo-600" />}
                                                </button>
                                            )}

                                            {branches
                                                .filter(b => b.name.toLowerCase().includes(branchSearch.toLowerCase()))
                                                .map(branch => (
                                                    <button
                                                        key={branch.id}
                                                        type="button"
                                                        onClick={() => setSelectedBranchId(branch.id)}
                                                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedBranchId === branch.id
                                                            ? 'bg-indigo-50 border-indigo-500 shadow-md'
                                                            : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'
                                                            }`}
                                                    >
                                                        <div className={`p-2 rounded-lg ${selectedBranchId === branch.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                                            <Store size={20} />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-sm">{branch.name}</p>
                                                            <p className="text-xs opacity-70">Scoped to this branch only</p>
                                                        </div>
                                                        {selectedBranchId === branch.id && <Check size={18} className="ml-auto text-indigo-600" />}
                                                    </button>
                                                ))}
                                        </div>
                                    </div>

                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                </form>
                            </div>
                            <div className="flex justify-end gap-3 p-6 bg-slate-50 border-t border-slate-100 items-center">
                                <Button variant="secondary" type="button" onClick={() => setIsGenerating(false)}>Cancel</Button>
                                <Button onClick={handleGenerate}>Generate</Button>
                            </div>
            </AccessibleModal>

            {/* Success Modal (Show Key) */}
            {generatedKey && (
            <AccessibleModal
                isOpen
                onClose={() => setGeneratedKey(null)}
                hideHeader
                ariaLabel="API Key Generated"
                closeOnOverlayClick={false}
                overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 p-8 border-t-8 border-emerald-500 max-h-[80vh] flex flex-col overflow-hidden"
            >
                            <div className="flex flex-col items-center text-center mb-6">
                                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                                    <Key size={32} />
                                </div>
                                <h3 className="text-2xl font-bold text-slate-800">API Key Generated!</h3>
                                <p className="text-slate-500 mt-2">Please copy your key immediately. For security, it will not be shown again.</p>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
                                {generatedKey}
                                <button
                                    onClick={() => copyToClipboard(generatedKey)}
                                    className="absolute top-2 right-2 p-2 bg-white text-indigo-600 rounded-lg shadow-sm hover:text-indigo-700 hover:shadow transition-all"
                                    title="Copy"
                                >
                                    <Copy size={16} />
                                </button>
                            </div>

                            <div className="mt-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl text-left">
                                <AlertTriangle className="text-amber-600 shrink-0" size={20} />
                                <p className="text-sm text-amber-800 font-medium">Store this key securely. If you lose it, you will need to generate a new one and update your integrations.</p>
                            </div>

                            <Button
                                onClick={() => setGeneratedKey(null)}
                                className="w-full mt-8 bg-slate-800 hover:bg-slate-900"
                            >
                                I have copied the key
                            </Button>
            </AccessibleModal>
            )}
        </div>
    );
};
