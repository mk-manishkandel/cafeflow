import { ShoppingCart } from 'lucide-react';

interface HeaderProps {
  branchName: string;
  itemCount: number;
  onCartClick: () => void;
}

export function Header({ branchName, itemCount, onCartClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-[#1a1a2e] text-white shadow-lg">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Canteen Pre-Order</h1>
          {branchName && (
            <p className="text-xs text-blue-200 mt-0.5">{branchName}</p>
          )}
        </div>
        <button
          onClick={onCartClick}
          aria-label={`View cart — ${itemCount} item${itemCount !== 1 ? 's' : ''}`}
          className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <ShoppingCart size={22} />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {itemCount > 99 ? '99+' : itemCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
