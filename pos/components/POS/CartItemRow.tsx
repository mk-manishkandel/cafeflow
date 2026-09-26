import React, { memo } from 'react';
import { CartItem } from '../../types';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';

import { formatCurrency } from '../../utils/currency';
interface CartItemRowProps {
    item: CartItem;
    onUpdate: (id: string, delta: number) => void;
    onRemove: (id: string) => void;
}

export const CartItemRow = memo(({ item, onUpdate, onRemove }: CartItemRowProps) => (
    <div className="flex gap-3 items-start group p-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:border-slate-200 transition-all duration-200 w-full mb-1">
        {/* Item Image */}
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <img
                src={item.image || '/Menu-Logo.png'}
                alt={item.name}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => (e.currentTarget.src = '/Menu-Logo.png')}
            />
        </div>
        
        {/* Item Content container */}
        <div className="flex flex-col flex-1 min-w-0 h-full justify-between pt-0.5">
            {/* Top Row: Name, Unit Price, Delete */}
            <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0 pr-2">
                    <h5 className="font-bold text-slate-900 text-[13px] uppercase tracking-tight leading-snug break-words">{item.name}</h5>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 block">{formatCurrency(item.price)}</span>
                </div>
                <button
                    onClick={() => onRemove(item.id)}
                    className="text-slate-300 hover:text-red-500 w-8 h-8 flex items-center justify-center hover:bg-red-50 rounded-lg transition-all shrink-0 mt-[-4px] mr-[-4px]"
                    aria-label={`Remove ${item.name} from cart`}
                >
                    <Trash2 size={16} aria-hidden="true" />
                </button>
            </div>
            
            {/* Bottom Row: Total Price and Quantity Controls */}
            <div className="flex justify-between items-end mt-1">
                <span className="text-[14px] font-black text-slate-900 tabular-nums tracking-tighter leading-none mb-0.5">
                    {formatCurrency((item.price * item.quantity))}
                </span>
                
                {/* Compact Quantity Stepper */}
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md p-0.5 h-[28px] shrink-0">
                    <Button
                        variant="ghost"
                        onClick={() => onUpdate(item.id, -1)}
                        className="w-6 h-6 !p-0 rounded hover:bg-slate-200 text-slate-600 transition-colors bg-white shadow-sm border border-slate-200 flex items-center justify-center"
                        aria-label={`Decrease quantity of ${item.name}`}
                    >
                        <Minus size={12} strokeWidth={3} aria-hidden="true" />
                    </Button>
                    <span className="text-[11px] font-black w-6 text-center tabular-nums text-slate-900" aria-live="polite">
                        {item.quantity}
                    </span>
                    <Button
                        variant="ghost"
                        onClick={() => onUpdate(item.id, 1)}
                        className="w-6 h-6 !p-0 rounded hover:bg-slate-200 text-slate-600 transition-colors bg-white shadow-sm border border-slate-200 flex items-center justify-center"
                        aria-label={`Increase quantity of ${item.name}`}
                    >
                        <Plus size={12} strokeWidth={3} aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    </div>
));
