import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { getPublicBranches } from './services/api';
import { useSession } from './hooks/useSession';
import { useMenu } from './hooks/useMenu';
import { useCart } from './hooks/useCart';
import { Header } from './components/layout/Header';
import { BranchFilter } from './components/BranchFilter';
import { MenuItemCard } from './components/menu/MenuItemCard';
import { CartSidebar } from './components/cart/CartSidebar';
import { CheckoutModal } from './components/checkout/CheckoutModal';
import { OrderConfirmation } from './components/checkout/OrderConfirmation';
import type { Branch, MenuItem } from './types';

interface ConfirmedOrder {
  orderId: string;
  email: string;
  items: ReturnType<typeof useCart>['items'];
  total: number;
  branchName: string;
}

export default function App() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);

  const [selectedCategory, setSelectedCategory] = useState('');

  const session = useSession();
  const menu = useMenu(selectedBranchId || undefined);
  const cart = useCart();

  // Load branches on mount
  useEffect(() => {
    getPublicBranches()
      .then(data => {
        setBranches(data);
        if (data.length > 0) setSelectedBranchId(data[0].id);
      })
      .catch(err => setBranchesError(err instanceof Error ? err.message : 'Failed to load branches'))
      .finally(() => setBranchesLoading(false));
  }, []);

  // Start session when we have a branch
  useEffect(() => {
    if (selectedBranchId && !session.sessionId) {
      void session.startSession(selectedBranchId);
    }
  }, [selectedBranchId, session]);

  const handleBranchChange = useCallback((branchId: string) => {
    if (branchId === selectedBranchId) return;
    if (cart.itemCount > 0) {
      const ok = window.confirm('Changing branch will clear your cart. Continue?');
      if (!ok) return;
    }
    cart.clearCart();
    setSelectedBranchId(branchId);
    setSelectedCategory('');
    void session.resetSession(branchId);
  }, [selectedBranchId, cart, session]);

  const handleOrderSuccess = useCallback((orderId: string, email: string) => {
    const branchName = branches.find(b => b.id === selectedBranchId)?.name ?? '';
    setConfirmedOrder({ orderId, email, items: [...cart.items], total: cart.total, branchName });
    setCheckoutOpen(false);
    setCartOpen(false);
    cart.clearCart();
  }, [branches, selectedBranchId, cart]);

  const handlePlaceAnother = useCallback(() => {
    setConfirmedOrder(null);
    void session.resetSession(selectedBranchId);
  }, [session, selectedBranchId]);

  const filteredItems = selectedCategory
    ? menu.items.filter(i => i.category === selectedCategory)
    : menu.items;

  const selectedBranchName = branches.find(b => b.id === selectedBranchId)?.name ?? '';

  if (confirmedOrder) {
    return (
      <OrderConfirmation
        orderId={confirmedOrder.orderId}
        email={confirmedOrder.email}
        items={confirmedOrder.items}
        total={confirmedOrder.total}
        branchName={confirmedOrder.branchName}
        onPlaceAnother={handlePlaceAnother}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        branchName={selectedBranchName}
        itemCount={cart.itemCount}
        onCartClick={() => setCartOpen(true)}
      />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <BranchFilter
            branches={branches}
            selectedBranchId={selectedBranchId}
            onChange={handleBranchChange}
          />
          {menu.categories.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory('')}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  selectedCategory === '' ? 'bg-[#1a1a2e] text-white border-[#1a1a2e]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                All
              </button>
              {menu.categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    selectedCategory === cat ? 'bg-[#1a1a2e] text-white border-[#1a1a2e]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading / Error / Empty states */}
        {(branchesLoading || menu.loading || session.loading) && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-[#1a1a2e]" />
          </div>
        )}

        {(branchesError || menu.error || session.error) && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
            <AlertCircle size={20} className="flex-shrink-0" />
            <p className="text-sm">{branchesError ?? menu.error ?? session.error}</p>
          </div>
        )}

        {!menu.loading && !menu.error && filteredItems.length === 0 && !branchesLoading && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-medium mb-1">No items available today</p>
            <p className="text-sm">Check back later or try a different branch.</p>
          </div>
        )}

        {/* Menu grid */}
        {filteredItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredItems.map((item: MenuItem) => (
              <MenuItemCard
                key={item.id}
                item={item}
                cartItem={cart.items.find(c => c.id === item.id)}
                onAdd={cart.addItem}
                onUpdateQuantity={cart.updateQuantity}
              />
            ))}
          </div>
        )}
      </main>

      {/* Sticky checkout bar when cart has items */}
      {cart.itemCount > 0 && !cartOpen && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t shadow-xl z-20">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full max-w-sm mx-auto flex items-center justify-between bg-[#1a1a2e] text-white px-5 py-3 rounded-xl text-sm font-semibold"
          >
            <span>{cart.itemCount} item{cart.itemCount !== 1 ? 's' : ''}</span>
            <span>View Cart  →</span>
            <span>Rs. {cart.total.toFixed(2)}</span>
          </button>
        </div>
      )}

      <CartSidebar
        isOpen={cartOpen}
        items={cart.items}
        total={cart.total}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={cart.updateQuantity}
        onRemoveItem={cart.removeItem}
        onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
      />

      {checkoutOpen && session.sessionId && (
        <CheckoutModal
          isOpen={checkoutOpen}
          items={cart.items}
          total={cart.total}
          branchId={selectedBranchId}
          sessionId={session.sessionId}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={handleOrderSuccess}
        />
      )}
    </div>
  );
}
