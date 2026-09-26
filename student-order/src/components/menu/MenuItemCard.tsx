import { Plus, Minus } from 'lucide-react';
import type { MenuItem, CartItem } from '../../types';

interface MenuItemCardProps {
  item: MenuItem;
  cartItem: CartItem | undefined;
  onAdd: (item: MenuItem) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
}

export function MenuItemCard({ item, cartItem, onAdd, onUpdateQuantity }: MenuItemCardProps) {
  const qty = cartItem?.quantity ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden">
      {item.image && (
        <div className="h-36 overflow-hidden bg-gray-50">
          <img
            src={item.image}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3 flex flex-col flex-1">
        {item.category && (
          <span className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
            {item.category}
          </span>
        )}
        <p className="font-semibold text-gray-900 text-sm leading-tight flex-1">{item.name}</p>
        <div className="flex items-center justify-between mt-3">
          <span className="text-base font-bold text-[#1a1a2e]">Rs. {item.price.toFixed(2)}</span>
          {qty === 0 ? (
            <button
              onClick={() => onAdd(item)}
              className="flex items-center gap-1 bg-[#1a1a2e] text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#2a2a4e] transition-colors"
              aria-label={`Add ${item.name} to cart`}
            >
              <Plus size={14} />
              Add
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdateQuantity(item.id, qty - 1)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                aria-label={`Remove one ${item.name}`}
              >
                <Minus size={12} />
              </button>
              <span className="text-sm font-bold w-5 text-center">{qty}</span>
              <button
                onClick={() => onUpdateQuantity(item.id, qty + 1)}
                className="w-7 h-7 rounded-full bg-[#1a1a2e] text-white hover:bg-[#2a2a4e] flex items-center justify-center transition-colors"
                aria-label={`Add one more ${item.name}`}
              >
                <Plus size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
