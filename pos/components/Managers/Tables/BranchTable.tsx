import React from 'react';
import { Building, Edit2, Trash2, MapPin } from 'lucide-react';
import { Branch } from '../../../types';
import { EmptyState } from '../../shared/EmptyState';

interface BranchTableProps {
    branches: Branch[];
    searchQuery: string;
    onEdit: (branch: Branch) => void;
    onDelete: (branch: Branch) => void;
    canManage: boolean;
}

export const BranchTable = ({
    branches,
    searchQuery,
    onEdit,
    onDelete,
    canManage
}: BranchTableProps) => {
    if (branches.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 p-20 flex justify-center">
                <EmptyState title={searchQuery ? "No branches match your search." : "No branches found."} />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {branches.map(branch => {
                const isMainBranch = branch.name === 'Main Branch';
                return (
                    <div key={branch.id} className={`bg-white rounded-xl shadow-sm border p-6 hover:border-indigo-200 transition-all group relative ${isMainBranch ? 'border-indigo-300 bg-indigo-50/10' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-lg ${isMainBranch ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                <Building size={24} />
                            </div>
                            <div className="flex gap-1 transition-opacity">
                                {!isMainBranch && canManage && (
                                    <>
                                        <button onClick={() => onEdit(branch)} aria-label={`Edit ${branch.name}`} className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95">
                                            <Edit2 size={16} aria-hidden="true" />
                                        </button>
                                        <button onClick={() => onDelete(branch)} aria-label={`Delete ${branch.name}`} className="p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95">
                                            <Trash2 size={16} aria-hidden="true" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                {branch.name}
                                {isMainBranch && (
                                    <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">Main</span>
                                )}
                            </h3>
                            <p className="text-xs text-slate-400 font-mono select-all">ID: {branch.id}</p>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-start gap-2 text-slate-500 text-sm">
                            <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                            <span className="leading-relaxed">{branch.address}</span>
                        </div>

                        {isMainBranch && (
                            <div className="mt-4 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                                <p className="text-[11px] text-indigo-600 font-medium">Combined overview of all branches.</p>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
