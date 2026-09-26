import React from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import { Button } from '../../ui/Button';
import { AccessibleModal } from '../../ui/AccessibleModal';

interface DeleteRoleModalProps {
    roleName: string | null;
    onClose: () => void;
    onConfirm: (roleName: string) => void;
    loading: boolean;
}

export const DeleteRoleModal = ({
    roleName,
    onClose,
    onConfirm,
    loading
}: DeleteRoleModalProps) => {
    return (
        <AccessibleModal
            isOpen={!!roleName}
            onClose={onClose}
            title="Delete Role"
            subtitle="Admin Controls"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-100">
                    <Trash2 size={20} />
                </div>
            }
            maxWidth="md"
            footer={
                <div className="flex justify-end gap-3">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="danger"
                        onClick={() => roleName && onConfirm(roleName)}
                        disabled={loading || !roleName}
                        isLoading={loading}
                        leftIcon={!loading && <Trash2 size={16} />}
                    >
                        Delete
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <p className="text-slate-600">
                    Are you sure you want to delete <span className="font-bold text-slate-800">{roleName}</span>?
                </p>
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                    <p className="text-sm text-red-700 flex items-start gap-2">
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                        This action cannot be undone. Users with this role will lose access.
                    </p>
                </div>
            </div>
        </AccessibleModal>
    );
};
