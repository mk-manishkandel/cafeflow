import React from 'react';
import { XCircle } from 'lucide-react';
import { Z_INDEX } from '../../constants/zIndex';
import { AccessibleModal } from '../ui/AccessibleModal';

interface LogDetailModalProps {
    log: any;
    onClose: () => void;
}

const LogDetailModal: React.FC<LogDetailModalProps> = ({ log, onClose }) => {

    if (!log) return null;

    return (
        <AccessibleModal
            isOpen={!!log}
            onClose={onClose}
            hideHeader
            ariaLabelledBy="log-modal-title"
            closeOnOverlayClick={false}
            overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-100"
            overlayStyle={{ zIndex: Z_INDEX.MODAL_BACKDROP }}
            panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-100 flex flex-col max-h-[80vh]"
            panelStyle={{ zIndex: Z_INDEX.MODAL_CONTENT }}
            bodyClassName="contents"
        >
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h3 id="log-modal-title" className="text-lg font-black text-slate-900 uppercase tracking-tight">Activity Details</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                Session: {log.session_id.substring(0, 12)}...
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                            aria-label="Close modal"
                        >
                            <XCircle size={24} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Action Type</p>
                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700">
                                        {log.action.replace(/_/g, ' ')}
                                    </span>
                                </div>
                                <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Captured At</p>
                                    <p className="font-bold text-xs text-slate-900">
                                        {new Date(log.created_at).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div className="p-5 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Complete Metadata</p>
                                <div className="space-y-3">
                                    {typeof log.metadata === 'object' ? (
                                        Object.entries(log.metadata).map(([key, value]) => (
                                            <div key={key} className="flex flex-col border-b border-slate-50 pb-2 last:border-0">
                                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1')}</span>
                                                <span className="text-sm font-bold text-slate-700 mt-0.5 break-words">
                                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm font-bold text-slate-700">{String(log.metadata)}</p>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Technical Info</p>
                                <div className="space-y-1.5">
                                    <p className="text-[11px] font-medium text-slate-500 flex justify-between">
                                        <span className="font-bold">IP Address</span>
                                        <span className="font-mono">{log.ip_address}</span>
                                    </p>
                                    <p className="text-[11px] font-medium text-slate-500">
                                        <span className="font-bold block mb-1">User Agent</span>
                                        <span className="block p-2 bg-slate-50 rounded border border-slate-100 break-all text-[9.5px]">
                                            {log.user_agent}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold transition-all active:scale-95"
                        >
                            Close Details
                        </button>
                    </div>
        </AccessibleModal>
    );
};

export default React.memo(LogDetailModal);
