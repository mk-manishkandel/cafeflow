import React from 'react';
import { ChevronRight, Lock, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { PROTECTED_ROLES, ALL_PERMISSIONS } from '../../../constants/permissions';

interface Role {
    name: string;
    permissions: string[];
}

interface RoleSidebarProps {
    roles: Role[];
    selectedRole: string | null;
    onSelectRole: (name: string) => void;
    onDeleteRole: (name: string) => void;
}

export const RoleSidebar: React.FC<RoleSidebarProps> = ({
    roles,
    selectedRole,
    onSelectRole,
    onDeleteRole
}) => {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sticky top-6 z-10 lg:z-0">
            <div className="flex items-center justify-between mb-4 lg:mb-4">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2">
                    Roles ({roles.length})
                </h2>
                <div className="lg:hidden text-xs text-slate-400 flex items-center gap-1">
                    <ChevronRight size={12} />
                    <span>Scroll</span>
                </div>
            </div>

            <div className="flex lg:flex-col gap-3 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide -mx-2 px-2 lg:mx-0 lg:px-0">
                {roles.map(role => {
                    const permCount = (role.permissions || []).filter(p => ALL_PERMISSIONS.includes(p)).length;
                    const totalPerms = ALL_PERMISSIONS.length;
                    const percentage = Math.round((permCount / totalPerms) * 100);

                    return (
                        <button
                            key={role.name}
                            onClick={() => onSelectRole(role.name)}
                            className={clsx(
                                "flex-shrink-0 w-64 lg:w-full text-left p-4 rounded-xl border transition-all duration-200",
                                selectedRole === role.name
                                    ? "bg-indigo-50 border-indigo-500 shadow-md"
                                    : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                            )}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={clsx(
                                        "w-2 h-2 rounded-full",
                                        selectedRole === role.name ? "bg-indigo-600" : "bg-slate-300"
                                    )} />
                                    <span className={clsx(
                                        "font-bold text-sm truncate max-w-[120px]",
                                        selectedRole === role.name ? "text-indigo-700" : "text-slate-800"
                                    )}>
                                        {role.name}
                                    </span>
                                    {PROTECTED_ROLES.includes(role.name) && (
                                        <Lock size={12} className="text-slate-400 shrink-0" />
                                    )}
                                </div>
                                {!PROTECTED_ROLES.includes(role.name) && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDeleteRole(role.name); }}
                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-indigo-500 transition-all duration-100"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                                <span className="text-xs font-semibold text-slate-500 tabular-nums">
                                    {permCount}/{totalPerms}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
