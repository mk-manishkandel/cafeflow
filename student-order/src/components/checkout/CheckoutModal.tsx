import { useState } from 'react';
import { X, Mail, Loader2 } from 'lucide-react';
import { createStudentOrder } from '../../services/api';
import type { CartItem } from '../../types';

interface CheckoutModalProps {
  isOpen: boolean;
  items: CartItem[];
  total: number;
  branchId: string;
  sessionId: string;
  onClose: () => void;
  onSuccess: (orderId: string, email: string) => void;
}

export function CheckoutModal({ isOpen, items, total, branchId, sessionId, onClose, onSuccess }: CheckoutModalProps) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createStudentOrder({
        sessionId,
        branchId,
        studentEmail: trimmedEmail,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          category: item.category,
          quantity: item.quantity
        })),
        totalAmount: total
      });
      onSuccess(result.orderId, trimmedEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Checkout"
        className="fixed inset-x-4 bottom-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full sm:max-w-md"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold text-base text-gray-900">Confirm Your Order</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Order summary */}
        <div className="p-4 max-h-48 overflow-y-auto border-b">
          {items.map(item => (
            <div key={item.id} className="flex justify-between text-sm py-1">
              <span className="text-gray-700">{item.name} × {item.quantity}</span>
              <span className="text-gray-900 font-medium">Rs. {(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-base pt-2 mt-2 border-t">
            <span>Total</span>
            <span>Rs. {total.toFixed(2)}</span>
          </div>
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label htmlFor="checkout-email" className="block text-sm font-medium text-gray-700 mb-1">
              Your email address
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="checkout-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Your order confirmation and ID will be sent here.</p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Placing Order…
              </>
            ) : (
              'Place Order'
            )}
          </button>
        </form>
      </div>
    </>
  );
}
