import { X, Trash2, ShoppingBag } from 'lucide-react';
import type { CartItem } from '../../types';

interface CartSidebarProps {
  isOpen: boolean;
  items: CartItem[];
  total: number;
  onClose: () => void;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemoveItem: (id: string) => void;
  onCheckout: () => void;
}

export function CartSidebar({ isOpen, items, total, onClose, onUpdateQuantity, onRemoveItem, onCheckout }: CartSidebarProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Shopping cart"
        aria-modal="true"
        className={`fixed right-0 top-0 h-full w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-[#1a1a2e] text-white">
          <h2 className="font-semibold text-base">Your Order</h2>
          <button onClick={onClose} aria-label="Close cart" className="p-1 rounded hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <ShoppingBag size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Your cart is empty</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Rs. {item.price.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    className="w-6 h-6 rounded-full bg-white border border-gray-200 text-xs font-bold flex items-center justify-center hover:bg-gray-100"
                    aria-label={`Decrease ${item.name} quantity`}
                  >−</button>
                  <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    className="w-6 h-6 rounded-full bg-[#1a1a2e] text-white text-xs font-bold flex items-center justify-center hover:bg-[#2a2a4e]"
                    aria-label={`Increase ${item.name} quantity`}
                  >+</button>
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="w-6 h-6 text-red-400 hover:text-red-600 flex items-center justify-center ml-1"
                    aria-label={`Remove ${item.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t p-4 space-y-3">
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>Rs. {total.toFixed(2)}</span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
