import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Branch, getBranches } from '../services/storageService';
import { ChevronDown, Search, Check } from 'lucide-react';
import clsx from 'clsx';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';

interface BranchContextType {
    currentBranch: Branch | null;
    setCurrentBranch: (branch: Branch) => void;
    branches: Branch[];
    loading: boolean;
    error: string | null;
    refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { lastEvent } = useSocket();
    const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refreshBranches = async () => {
        try {
            setLoading(true);
            const data = await getBranches();

            setBranches(data);
            setError(null);

            if (user?.branchId && user?.role?.toLowerCase() !== 'admin') {
                // Regular staff is restricted to a branch
                const assignedBranch = data.find(b => b.id === user.branchId);
                if (assignedBranch) {
                    setCurrentBranch(assignedBranch);
                } else {
                    setError("Unable to load your assigned branch. Please contact administrator.");
                    setCurrentBranch(null);
                }
            } else {
                // User is Admin (even if they have a default branchId)
                // Check local storage for preference
                const savedBranchId = localStorage.getItem('selectedBranchId');
                if (savedBranchId) {
                    const savedBranch = data.find(b => b.id === savedBranchId);
                    if (savedBranch) {
                        setCurrentBranch(savedBranch);
                    } else if (data.length > 0) {
                        setCurrentBranch(data[0]);
                    }
                } else if (data.length > 0) {
                    // Default to first available operational branch
                    setCurrentBranch(data[0]);
                }
            }
        } catch (_e) {
            // Handle secretly
            setError("Failed to load system data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            refreshBranches();
        } else {
            setLoading(false);
        }
    }, [user]);

    // Keep a stable ref to refreshBranches so event listeners never go stale
    const refreshBranchesRef = useRef(refreshBranches);
    useEffect(() => { refreshBranchesRef.current = refreshBranches; }, [refreshBranches]);

    // Sync branches when storage or auth changes
    useEffect(() => {
        const handleRefresh = () => refreshBranchesRef.current();
        window.addEventListener('auth-change', handleRefresh);
        return () => window.removeEventListener('auth-change', handleRefresh);
    }, []);

    // Effect to handle WebSocket updates
    useEffect(() => {
        if (lastEvent?.type === 'data:updated' &&
            typeof lastEvent.data === 'object' && lastEvent.data !== null &&
            (lastEvent.data as Record<string, unknown>).type === 'branch') {
            refreshBranchesRef.current();
        }
    }, [lastEvent]);

    const handleSetBranch = (branch: Branch) => {
        setCurrentBranch(branch);
        // Admins can always save their preferred branch
        if (!user?.branchId || user?.role?.toLowerCase() === 'admin') {
            localStorage.setItem('selectedBranchId', branch.id);
        }
    };

    return (
        <BranchContext.Provider value={{ currentBranch, setCurrentBranch: handleSetBranch, branches, loading, refreshBranches, error }}>
            {children}
        </BranchContext.Provider>
    );
};

export const useBranch = () => {
    const context = useContext(BranchContext);
    if (context === undefined) {
        throw new Error('useBranch must be used within a BranchProvider');
    }
    return context;
};

export const BranchSelector = ({ className }: { className?: string }) => {
    const { user } = useAuth();
    const { currentBranch, branches, setCurrentBranch } = useBranch();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const isRestricted = !!user?.branchId && user?.role?.toLowerCase() !== 'admin';

    // Filter branches based on search
    const filteredBranches = branches.filter(b =>
        b.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setSearchTerm(''); // Reset search on close
        }
    }, [isOpen]);

    if (branches.length === 0) return null;
    if (isRestricted) return (
        <div className="flex items-center gap-2 px-3 h-11 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold border border-indigo-100/50">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
            {currentBranch?.name || 'Loading...'}
        </div>
    );

    return (
        <div className={clsx("relative", className)} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between gap-2 px-4 h-full border rounded-xl text-sm font-bold transition-all shadow-sm whitespace-nowrap
                    ${isOpen
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-4 ring-indigo-50/50'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
            >
                <div className="flex items-center gap-2 truncate">
                    <div className="shrink-0 w-2 h-2 rounded-full bg-slate-300 group-hover:bg-indigo-400 transition-colors" />
                    <span className="truncate">{currentBranch?.name === 'Main Branch' ? 'Main Branch (System)' : (currentBranch?.name || 'Select Branch')}</span>
                </div>
                <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[60] animate-in fade-in zoom-in-95 duration-100 flex flex-col origin-top-left">
                    <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Search branch..."
                                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white placeholder:text-slate-400"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="max-h-[320px] overflow-y-auto p-1 custom-scrollbar">
                        <div className="px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Available Branches</span>
                            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px]">{filteredBranches.length}</span>
                        </div>

                        {filteredBranches.length > 0 ? (
                            filteredBranches.map(branch => {
                                const isSelected = currentBranch?.id === branch.id;
                                return (
                                    <button
                                        key={branch.id}
                                        onClick={() => {
                                            setCurrentBranch(branch);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2.5 mb-0.5 rounded-lg text-sm transition-all flex items-center justify-between group
                                            ${isSelected
                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                            }`}
                                    >
                                        <span className="font-medium truncate pr-2">
                                            {branch.name === 'Main Branch' ? 'Main Branch (System)' : branch.name}
                                        </span>
                                        {isSelected && <Check className="w-4 h-4 text-white" />}
                                    </button>
                                );
                            })
                        ) : (
                            <div className="px-4 py-8 text-center">
                                <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                                <p className="text-sm text-slate-500">No branches found</p>
                            </div>
                        )}
                    </div>
                    {filteredBranches.length > 0 && (
                        <div className="p-2 bg-slate-50 border-t border-slate-100 text-[10px] text-center text-slate-400">
                            Showing {filteredBranches.length} of {branches.length} branches
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
