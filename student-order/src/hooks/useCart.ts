import { useState, useCallback, useMemo } from 'react';
import type { MenuItem, CartItem } from '../types';

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: MenuItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.id !== id));
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, quantity } : i));
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = useMemo(() =>
    items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  [items]);

  const itemCount = useMemo(() =>
    items.reduce((sum, item) => sum + item.quantity, 0),
  [items]);

  return { items, total, itemCount, addItem, removeItem, updateQuantity, clearCart };
}
