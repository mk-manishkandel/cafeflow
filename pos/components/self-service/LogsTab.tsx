import React from 'react';
import { Eye } from 'lucide-react';
import Pagination from '../Pagination';
import LogMetaDetail from './LogMetaDetail';
import LogDeviceDetail from './LogDeviceDetail';

interface ActivityLog {
    id: number;
    session_id: string;
    action: string;
    metadata: any;
    created_at: string;
    branch_id: string;
    branch_name: string;
    ip_address?: string;
    user_agent?: string;
}

interface LogsTabProps {
    logs: ActivityLog[];
    selectedSessionId: string | null;
    setSelectedSessionId: (id: string | null) => void;
    setSelectedLog: (log: ActivityLog) => void;
    isMainBranch: boolean;
    currentPage: number;
    totalPages: number;
    totalLogs: number;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
}

const LogsTab: React.FC<LogsTabProps> = ({
    logs,
    selectedSessionId,
    setSelectedSessionId,
    setSelectedLog,
    isMainBranch,
    currentPage,
    totalPages,
    totalLogs,
    onPageChange,
    itemsPerPage
}) => {
    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider">System Activity Monitoring</h3>
                {selectedSessionId && (
                    <button
                        onClick={() => setSelectedSessionId(null)}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
                    >
                        Clear Session Filter
                    </button>
                )}
            </div>

            {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Eye size={48} className="mb-4 opacity-20" />
                    <p className="font-bold">No activity logs found{selectedSessionId ? ' for this session' : ''}.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="overflow-x-auto pt-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Session ID</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Device / IP</th>
                                    {isMainBranch && (
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                                    )}
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {(Array.isArray(logs) ? logs : []).map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setSelectedSessionId(log.session_id)}
                                                className={`text-[11px] font-mono font-bold px-2 py-1 rounded transition-all border ${selectedSessionId === log.session_id
                                                    ? 'bg-indigo-600 text-white border-indigo-700'
                                                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-indigo-600 hover:border-indigo-200'
                                                    }`}
                                                title="View only this session"
                                            >
                                                {log.session_id.substring(0, 8).toUpperCase()}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${log.action === 'SESSION_START' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                                                log.action.includes('CHECKOUT') ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                                    log.action === 'SEARCH' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                                        'bg-slate-50 text-slate-600 border border-slate-200'
                                                }`}>
                                                {String(log.action || '').replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <LogMetaDetail
                                                action={log.action}
                                                metadata={log.metadata}
                                                onClick={() => setSelectedLog(log)}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <LogDeviceDetail
                                                userAgent={log.user_agent}
                                                ipAddress={log.ip_address}
                                            />
                                        </td>
                                        {isMainBranch && (
                                            <td className="px-6 py-4">
                                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded uppercase tracking-wider border border-slate-200">
                                                    {log.branch_name}
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-6 py-4 text-slate-500 text-[11px] font-bold text-right whitespace-nowrap tabular-nums">
                                            {new Date(log.created_at).toLocaleString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="border-t border-slate-100 bg-slate-50/30">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={(p) => onPageChange(p)}
                            itemsPerPage={itemsPerPage}
                            totalItems={totalLogs}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(LogsTab);
