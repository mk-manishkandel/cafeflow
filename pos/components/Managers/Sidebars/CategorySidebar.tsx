import React from 'react';
import { FolderPlus, Plus, MapPin, Trash2 } from 'lucide-react';
import { Category } from '../../../types';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';

interface CategorySidebarProps {
    categories: Category[];
    newCategoryName: string;
    setNewCategoryName: (val: string) => void;
    onAddCategory: (e: React.FormEvent) => void;
    onDeleteCategory: (category: Category) => void;
    canManage: boolean;
    isMainBranch: boolean;
    branchMap: Record<string, string>;
}

export const CategorySidebar: React.FC<CategorySidebarProps> = ({
    categories,
    newCategoryName,
    setNewCategoryName,
    onAddCategory,
    onDeleteCategory,
    canManage,
    isMainBranch,
    branchMap
}) => {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-50 rounded-xl">
                    <FolderPlus size={20} className="text-indigo-600" />
                </div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg">Categories</h3>
            </div>

            {canManage ? (
                <form onSubmit={onAddCategory} className="flex gap-2 mb-8 items-start">
                    <div className="flex-1 min-w-0">
                        <Input
                            type="text"
                            value={newCategoryName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCategoryName(e.target.value)}
                            placeholder="Add category..."
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={!newCategoryName.trim()}
                        className="!p-2.5 bg-slate-900 hover:bg-indigo-600 h-10 shadow-md shadow-slate-100"
                    >
                        <Plus size={20} />
                    </Button>
                </form>
            ) : isMainBranch && (
                <div className="mb-8 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 leading-tight">
                        Main Branch Restriction
                    </p>
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-tighter mt-1">
                        Categories must be managed at branch level.
                    </p>
                </div>
            )}

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                {categories.length > 0 ? (
                    categories.map(c => (
                        <div key={c.id} className="group flex justify-between items-center p-3 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
                            <div className="flex flex-col min-w-0">
                                <span className="font-black text-slate-900 text-sm truncate uppercase tracking-tight">{c.name}</span>
                                {isMainBranch && c.branchId && (
                                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 uppercase tracking-widest mt-0.5">
                                        <MapPin size={10} className="shrink-0" />
                                        {branchMap[c.branchId] || 'Unknown Branch'}
                                    </span>
                                )}
                            </div>
                            {canManage && (
                                <button
                                    onClick={() => onDeleteCategory(c)}
                                    className="p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
                                    title="Delete Category"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="py-12 text-center">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200">
                            <FolderPlus size={20} className="text-slate-300" />
                        </div>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest italic tracking-tighter">No categories found</p>
                    </div>
                )}
            </div>
        </div>
    );
};
