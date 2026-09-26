import React from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '../../ui/Button';
import { AccessibleModal } from '../../ui/AccessibleModal';

interface MenuImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDownloadTemplate: () => void;
    onUploadClick: () => void;
    isImporting: boolean;
    isMainBranch: boolean;
}

export const MenuImportModal = ({
    isOpen,
    onClose,
    onDownloadTemplate,
    onUploadClick,
    isImporting,
    isMainBranch
}: MenuImportModalProps) => {
    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title="Bulk Import Menu"
            subtitle="Menu Tools"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                    <FileSpreadsheet size={20} />
                </div>
            }
            maxWidth="lg"
        >
            <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 shadow-sm">
                    <h3 className="text-xs font-black uppercase text-blue-900 tracking-widest mb-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        CSV Format Required
                    </h3>
                    <p className="text-xs text-blue-700 leading-relaxed font-bold">
                        Your CSV must have these columns:
                    </p>
                    <div className="mt-2 bg-white/50 p-2 rounded-lg border border-blue-100 font-mono text-[10px] text-blue-800">
                        name, price, category, image{isMainBranch ? ', branch' : ''}
                    </div>
                    {isMainBranch && (
                        <p className="text-[10px] text-blue-600 mt-2 italic font-medium">
                            <strong>Note:</strong> for Main Branch admin, providing a valid <code className="bg-blue-100/50 px-1 rounded">branch</code> name for each item is compulsory.
                        </p>
                    )}
                </div>

                <div className="space-y-3">
                    <Button
                        variant="success"
                        onClick={onDownloadTemplate}
                        className="w-full py-4 rounded-2xl shadow-lg shadow-emerald-100 font-black uppercase text-[11px] tracking-widest"
                        leftIcon={<FileSpreadsheet size={20} />}
                    >
                        Download Template
                    </Button>

                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-100"></div>
                        </div>
                        <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                            <span className="px-4 bg-white text-slate-400">Step 2</span>
                        </div>
                    </div>

                    <Button
                        onClick={onUploadClick}
                        disabled={isImporting}
                        isLoading={isImporting}
                        className="w-full py-4 rounded-2xl shadow-lg shadow-indigo-100 font-black uppercase text-[11px] tracking-widest"
                        leftIcon={!isImporting && <Upload size={20} />}
                    >
                        {isImporting ? 'Processing...' : 'Upload CSV File'}
                    </Button>
                </div>
            </div>
        </AccessibleModal>
    );
};
