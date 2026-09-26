import React from 'react';
import { Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../../ui/Button';

interface MenuBulkActionsProps {
    selectedCount: number;
    onClearSelection: () => void;
    onBulkDelete: () => void;
    onBulkTodayMenu: (active: boolean) => void;
    canEdit?: boolean;
}

export const MenuBulkActions = ({
    selectedCount,
    onClearSelection,
    onBulkDelete,
    onBulkTodayMenu,
    canEdit = true
}: MenuBulkActionsProps) => {
    if (selectedCount === 0) return null;

    return (
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
                    {selectedCount} Selected
                </div>
                <button
                    onClick={onClearSelection}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                >
                    Clear selection
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {canEdit && (
                    <>
                        {/* Today Menu Actions */}
                        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-indigo-100 shadow-sm">
                            <button
                                onClick={() => onBulkTodayMenu(true)}
                                className="px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-1.5 transition-all"
                                title="Add selected items to today's menu"
                            >
                                <CheckCircle2 size={14} /> Add to Today
                            </button>
                            <div className="w-px h-4 bg-indigo-100 mx-1"></div>
                            <button
                                onClick={() => onBulkTodayMenu(false)}
                                className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5 transition-all"
                                title="Remove selected items from today's menu"
                            >
                                <XCircle size={14} /> Remove from Today
                            </button>
                        </div>

                    </>
                )}

                {/* Delete Action */}
                <Button
                    variant="danger"
                    onClick={onBulkDelete}
                    className="shadow-md"
                    leftIcon={<Trash2 size={16} />}
                >
                    Delete
                </Button>
            </div>
        </div>
    );
};
