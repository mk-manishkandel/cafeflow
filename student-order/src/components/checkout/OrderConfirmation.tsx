import { CheckCircle, RefreshCw } from 'lucide-react';
import type { CartItem } from '../../types';

interface OrderConfirmationProps {
  orderId: string;
  email: string;
  items: CartItem[];
  total: number;
  branchName: string;
  onPlaceAnother: () => void;
}

export function OrderConfirmation({ orderId, email, items, total, branchName, onPlaceAnother }: OrderConfirmationProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6 space-y-6">
        {/* Success icon */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle size={36} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Order Placed!</h1>
          <p className="text-sm text-gray-500 mt-1">Your order has been received.</p>
        </div>

        {/* Order ID */}
        <div className="border-2 border-[#1a1a2e] rounded-xl p-4 text-center bg-[#f8f8ff]">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Your Order ID</p>
          <p className="text-3xl font-black text-[#1a1a2e] font-mono tracking-widest">{orderId}</p>
          <p className="text-xs text-gray-500 mt-2">Show this to the cashier to collect your order</p>
        </div>

        {/* Email notice */}
        <p className="text-sm text-center text-gray-600">
          A confirmation has been sent to <strong>{email}</strong>
        </p>

        {/* Branch */}
        <p className="text-xs text-center text-gray-400">{branchName}</p>

        {/* Order summary */}
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Summary</p>
          </div>
          <div className="divide-y">
            {items.map(item => (
              <div key={item.id} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-gray-700">{item.name} × {item.quantity}</span>
                <span className="font-medium">Rs. {(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-2 font-bold bg-gray-50">
              <span>Total</span>
              <span>Rs. {total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Note */}
        <p className="text-xs text-center text-gray-400 bg-amber-50 border border-amber-100 rounded-lg p-3">
          Payment is collected at the counter when you present your Order ID.
        </p>

        {/* Place another */}
        <button
          onClick={onPlaceAnother}
          className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          <RefreshCw size={14} />
          Place Another Order
        </button>
      </div>
    </div>
  );
}
