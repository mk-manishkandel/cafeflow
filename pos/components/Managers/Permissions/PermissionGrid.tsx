import React from 'react';
import { ChevronDown, ChevronRight, Check, Shield } from 'lucide-react';
import clsx from 'clsx';

interface PermissionGridProps {
    filteredGroups: any[];
    expandedGroups: string[];
    currentRole: { name: string; permissions: string[] };
    onToggleGroup: (groupName: string) => void;
    onTogglePermission: (roleName: string, permId: string) => void;
    onToggleAllGroupPermissions: (roleName: string, groupPerms: string[], activeCount: number) => void;
    searchQuery: string;
}

export const PermissionGrid: React.FC<PermissionGridProps> = ({
    filteredGroups,
    expandedGroups,
    currentRole,
    onToggleGroup,
    onTogglePermission,
    onToggleAllGroupPermissions,
    searchQuery
}) => {
    return (
        <div className="p-4 sm:p-5">
            <div className="space-y-3">
                {filteredGroups.map(group => {
                    const Icon = group.icon;
                    const isExpanded = expandedGroups.includes(group.name);
                    const activeCount = currentRole.permissions.filter(p =>
                        group.permissions.some((gp: any) => gp.id === p)
                    ).length;
                    const groupPermIds = group.permissions.map((p: any) => p.id);

                    return (
                        <div key={group.name} className="border border-slate-200 rounded-xl overflow-hidden">
                            <button
                                onClick={() => onToggleGroup(group.name)}
                                className="w-full flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-slate-50 hover:bg-slate-100 transition-colors gap-3"
                            >
                                <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                                    <div className="p-2 rounded-lg bg-white border border-slate-200 shrink-0">
                                        <Icon size={16} className="text-slate-600" />
                                    </div>
                                    <span className="font-semibold text-slate-800 truncate text-sm sm:text-base">{group.name}</span>
                                    <span className={clsx(
                                        "shrink-0 px-2 py-0.5 rounded-full text-xs font-bold",
                                        activeCount === group.permissions.length
                                            ? "bg-green-100 text-green-700"
                                            : activeCount > 0
                                                ? "bg-amber-100 text-amber-700"
                                                : "bg-slate-100 text-slate-500"
                                    )}>
                                        {activeCount}/{group.permissions.length}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pl-11 sm:pl-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleAllGroupPermissions(currentRole.name, groupPermIds, activeCount);
                                        }}
                                        className={clsx(
                                            "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap",
                                            activeCount === group.permissions.length
                                                ? "bg-slate-200 text-slate-600 hover:bg-red-100 hover:text-red-600"
                                                : "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
                                        )}
                                    >
                                        {activeCount === group.permissions.length ? 'Revoke All' : 'Grant All'}
                                    </button>
                                    {isExpanded ? <ChevronDown size={18} className="text-slate-400 shrink-0" /> : <ChevronRight size={18} className="text-slate-400 shrink-0" />}
                                </div>
                            </button>

                            {isExpanded && (
                                <div className="p-4 bg-white border-t border-slate-100">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {group.permissions.map((perm: any) => {
                                            const isActive = currentRole.permissions.includes(perm.id);
                                            return (
                                                <button
                                                    key={perm.id}
                                                    onClick={() => onTogglePermission(currentRole.name, perm.id)}
                                                    className={clsx(
                                                        "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                                                        isActive
                                                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                                            : "border-slate-100 bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                                                    )}
                                                >
                                                    <div className={clsx(
                                                        "w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors",
                                                        isActive ? "bg-indigo-600" : "bg-slate-200"
                                                    )}>
                                                        {isActive && <Check size={12} className="text-white" strokeWidth={3} />}
                                                    </div>
                                                    <span className="text-sm font-medium">{perm.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {filteredGroups.length === 0 && (
                <div className="text-center py-12">
                    <Shield className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">No permissions found matching "{searchQuery}"</p>
                </div>
            )}
        </div>
    );
};
