import React from 'react';
import clsx from 'clsx';
import { AlertCircle, Info, AlertTriangle, ShieldAlert, User } from 'lucide-react';
import { EmptyState } from '../../shared/EmptyState';
import { AuditLog } from '../../../types';
import { getAppTimezone } from '../../../utils/dateUtils';

interface AuditLogTableProps {
    logs: AuditLog[];
    loading: boolean;
    isMainBranch: boolean;
    searchQuery: string;
}

export const AuditLogTable = ({
    logs,
    loading,
    isMainBranch: _isMainBranch,
    searchQuery
}: AuditLogTableProps) => {
    const getLevelConfig = (action: string) => {
        if (action.includes('DELETE') || action.includes('FAILED')) {
            return {
                icon: ShieldAlert,
                badge: 'bg-red-50 text-red-700 border-red-100'
            };
        }
        if (action.includes('UPDATE') || action.includes('CHANGE')) {
            return {
                icon: AlertTriangle,
                badge: 'bg-amber-50 text-amber-700 border-amber-100'
            };
        }
        if (action.includes('CREATE')) {
            return {
                icon: AlertCircle,
                badge: 'bg-emerald-50 text-emerald-700 border-emerald-100'
            };
        }
        return {
            icon: Info,
            badge: 'bg-slate-50 text-slate-600 border-slate-200'
        };
    };

    return (
        <div className="overflow-x-auto pt-1">
            <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[15%] leading-tight">Timestamp</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[20%]">Identity</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[20%]">Action</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-[45%]">Event Details</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                    {loading && logs.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="px-6 py-20 text-center">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-slate-500 font-medium">Fetching secure logs...</p>
                                </div>
                            </td>
                        </tr>
                    ) : logs.length > 0 ? (
                        logs.map(log => {
                            const config = getLevelConfig(log.action);
                            const Icon = config.icon;

                            return (
                                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap align-top">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-slate-700">{new Date(log.timestamp).toLocaleDateString('en-US', { timeZone: getAppTimezone() })}</span>
                                            <span className="text-xs text-slate-400 font-mono tracking-tight uppercase">{new Date(log.timestamp).toLocaleTimeString('en-US', { timeZone: getAppTimezone() })}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shadow-sm border border-slate-200/50 shrink-0">
                                                <User size={14} />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-bold text-slate-800 truncate">{log.user_name || 'System Service'}</span>
                                                {log.branch_id && <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider mt-0.5">ID: {log.branch_id}</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <span className={clsx(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm",
                                            config.badge
                                        )}>
                                            <Icon size={12} strokeWidth={3} />
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <p className="text-sm text-slate-600 max-w-2xl leading-relaxed italic" title={log.details}>
                                            {log.details}
                                        </p>
                                    </td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={4} className="p-0">
                                <div className="py-20 flex justify-center">
                                    <EmptyState title={searchQuery ? "No matching logs found." : "No audit logs recorded yet."} />
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
