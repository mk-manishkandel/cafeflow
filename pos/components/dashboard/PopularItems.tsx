import React from 'react';
import { ShoppingBag } from 'lucide-react';
import Skeleton from '../Skeleton';

import { formatCurrency } from '../../utils/currency';
interface PopularItemsProps {
    loading: boolean;
    topItems: any[];
}

export const PopularItems: React.FC<PopularItemsProps> = ({ loading, topItems }) => {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-6 uppercase tracking-tight text-sm">Popular Items</h3>
            <div className="space-y-4">
                {loading ? (
                    [...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-xl">
                            <div className="flex items-center gap-4 w-full">
                                <Skeleton width={32} height={32} circle />
                                <div className="space-y-2 flex-1">
                                    <Skeleton width="60%" height={16} />
                                    <Skeleton width="30%" height={12} />
                                </div>
                            </div>
                        </div>
                    ))
                ) : topItems.length > 0 ? (
                    topItems.map((item: any, index: number) => (
                        <div key={item.id ?? item.name ?? index} className="flex items-center justify-between p-4 bg-white hover:bg-slate-50 rounded-xl border border-transparent hover:border-slate-100 transition-all group">
                            <div className="flex items-center gap-4">
                                <span className="w-8 h-8 flex items-center justify-center bg-slate-50 rounded-xl font-bold text-slate-400 border border-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-all text-xs">
                                    {index + 1}
                                </span>
                                <div>
                                    <p className="font-bold text-slate-700 text-sm">{item.name}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{item.quantity} orders</p>
                                </div>
                            </div>
                            <span className="font-bold text-slate-800 text-sm">{formatCurrency(Number(item.revenue || 0))}</span>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-12 text-slate-400">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ShoppingBag className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-sm font-bold opacity-60">No sales available for this period</p>
                    </div>
                )}
            </div>
        </div>
    );
};
