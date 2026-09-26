import React, { memo } from 'react';
import { MenuItem } from '../../types';
import { Zap } from 'lucide-react';
import clsx from 'clsx';

import { formatCurrency } from '../../utils/currency';
interface MenuItemCardProps {
    item: MenuItem;
    quantity?: number;
    onAdd: (item: MenuItem) => void;
}

export const MenuItemCard = memo(({ item, quantity, onAdd }: MenuItemCardProps) => {
    const [isLoaded, setIsLoaded] = React.useState(false);

    return (
        <div className={!item.available ? 'opacity-50' : ''} aria-disabled={!item.available}>
        <button
            type="button"
            onClick={() => onAdd(item)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onAdd(item);
                }
            }}
            disabled={!item.available}
            aria-label={`${item.available === false ? 'Unavailable: ' : ''}Add ${item.name} to cart, Price: ${formatCurrency(item.price)}${quantity ? `, Currently ${quantity} in cart` : ''}`}
            className={clsx(
                "group bg-white border rounded-xl p-3 transition-transform flex flex-col relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 text-left w-full",
                item.available === false
                    ? "cursor-not-allowed disabled:cursor-not-allowed disabled:opacity-50"
                    : "cursor-pointer active:scale-95",
                quantity ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-100 hover:border-indigo-500"
            )}
        >
            {quantity && quantity > 0 ? (
                <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-white z-10">
                    {quantity}
                </div>
            ) : null}

            <div className="h-24 overflow-hidden rounded-t-xl mb-2 relative bg-slate-50 flex items-center justify-center">
                {!isLoaded && <div className="absolute inset-0 shimmer bg-slate-100 z-0" />}
                <img
                    src={item.image || '/Menu-Logo.png'}
                    alt={item.name}
                    loading="lazy"
                    onLoad={() => setIsLoaded(true)}
                    className={clsx(
                        "w-full h-full object-cover transition-all duration-100 ease-out group-hover:scale-110",
                        isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
                    )}
                    onError={(e) => {
                        e.currentTarget.src = '/Menu-Logo.png';
                        setIsLoaded(true);
                    }}
                />
                <div className="absolute bottom-1 right-1 px-2 py-0.5 bg-black/60 backdrop-blur rounded text-white text-[10px] font-bold">
                    {item.category}
                </div>
                {item.isTodayMenu && (
                    <div className="absolute top-1 left-1 px-2 py-0.5 bg-orange-500 text-white text-[10px] font-bold uppercase rounded z-10 flex items-center gap-1">
                        <Zap size={10} fill="currentColor" /> Today
                    </div>
                )}
            </div>

            <div className="flex-1 flex flex-col justify-between">
                <h4 className="font-semibold text-slate-800 line-clamp-2 text-sm leading-tight mb-1">{item.name}</h4>
                <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-indigo-600 text-sm">{formatCurrency(item.price)}</span>
                    {item.available === false && (
                        <span className="text-xs bg-red-100 text-red-600 px-1 rounded">Unavailable</span>
                    )}
                </div>
            </div>
        </button>
        </div>
    );
});

MenuItemCard.displayName = 'MenuItemCard';
