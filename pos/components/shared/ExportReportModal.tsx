import React, { useState } from 'react';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import { authenticatedFetch, API_BASE } from '../../services/storageService';
import { useUI } from '../ui/UIContext';
import logger from '../../utils/logger';
import { AccessibleModal } from '../ui/AccessibleModal';

interface ExportReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    exportApiRoute: string; // e.g., '/staff/export'
    defaultFileName: string;
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({ isOpen, onClose, exportApiRoute, defaultFileName }) => {
    const { showToast } = useUI();
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const url = new URL(`${API_BASE}${exportApiRoute}`, window.location.origin);

            const response = await authenticatedFetch(url.toString());

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || 'Export failed');
            }

            // Handle file download
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;

            // Extract filename from Content-Disposition if available
            const disposition = response.headers.get('content-disposition');
            let filename = defaultFileName;
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);

            onClose();
            showToast('Export successful!', 'success');
        } catch (error: any) {
            logger.error('Export error:', error);
            showToast('Failed to export report: ' + error.message, 'error');
        } finally {
            setIsExporting(false);
        }
    };


    if (!isOpen) return null;

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            hideHeader
            ariaLabelledBy="export-modal-title"
            closeOnOverlayClick={false}
            overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200"
            panelClassName="bg-white rounded-3xl shadow-xl w-full max-w-md animate-in zoom-in duration-200 max-h-[80vh] flex flex-col overflow-hidden"
            bodyClassName="contents"
        >
                    <div className="flex items-center justify-between p-6 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                <FileSpreadsheet size={20} className="stroke-[2.5]" aria-hidden="true" />
                            </div>
                            <h3 id="export-modal-title" className="text-xl font-bold text-slate-800">Export Options</h3>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={isExporting}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"
                            aria-label="Close modal"
                        >
                            <X size={20} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="p-6">
                        <p className="text-sm text-slate-600">
                            The report is generated as an Excel file using the standard CafeFlow template.
                        </p>
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-100 rounded-b-3xl">
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExporting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <Download size={18} />
                            )}
                            {isExporting ? 'Generating...' : 'Download Report'}
                        </button>
                    </div>
        </AccessibleModal>
    );
};
