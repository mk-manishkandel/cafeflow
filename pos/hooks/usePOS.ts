import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getMenu, getCategories, getPaymentMethods, getStaff, getConsumers } from '../services/storageService';
import { isAbortError } from '../services/errors';
import { normalizeList } from '../components/shared/apiNormalize';
import { getItemRaw, setItemRaw } from '../utils/safeStorage';
import { MenuItem, Category, PaymentMethodSettings, CartItem, Staff, Consumer } from '../types';
import { useRealTimeUpdate } from './useRealTimeUpdate';

interface UsePOSProps {
    branchId?: string;
    printerKey: string;
    includeMembers?: boolean;
}

export const usePOS = ({ branchId, printerKey, includeMembers = false }: UsePOSProps) => {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSettings[]>([]);
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [consumerList, setConsumerList] = useState<Consumer[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [printerMode, setPrinterMode] = useState<'LOCAL' | 'NETWORK' | 'OFF'>(() => {
        const saved = getItemRaw(printerKey, '');
        // Migrate legacy 'SERVER' value to 'NETWORK'
        const coerced = saved === 'SERVER' ? 'NETWORK' : saved;
        return (coerced as 'LOCAL' | 'NETWORK' | 'OFF') || (printerKey.includes('posn') ? 'NETWORK' : 'LOCAL');
    });

    useEffect(() => {
        setItemRaw(printerKey, printerMode);
    }, [printerMode, printerKey]);

    // Track whether initial data has loaded so we can skip the spinner on silent refreshes
    // without putting menuItems.length in the useCallback dep array (which causes a fetch loop)
    const hasDataRef = useRef(false);

    // Reset the flag whenever the branch changes so we show the spinner again
    useEffect(() => {
        hasDataRef.current = false;
    }, [branchId]);

    const loadData = useCallback(async (isSilent = false, signal?: AbortSignal) => {
        // Performance: Only show loading if we don't have any items yet
        // This prevents the 'spinner' flash when returning to the POS page
        const shouldShowLoading = !isSilent && !hasDataRef.current;
        if (shouldShowLoading) setLoading(true);

        try {
            // When isSilent is true (e.g. WebSocket update), we pass true as forceRefresh
            // to ensure we actually get the latest data from the server.
            const promises: Promise<any>[] = [
                getMenu(branchId, undefined, undefined, undefined, undefined, undefined, isSilent, false, signal),
                getCategories(branchId, isSilent, signal),
                getPaymentMethods(branchId, isSilent, signal)
            ];

            if (includeMembers) {
                promises.push(getStaff());
                promises.push(getConsumers());
            }

            const [menu, cats, pms, staff, consumers] = await Promise.all(promises);
            setMenuItems(normalizeList<MenuItem>(menu));
            setCategories(normalizeList<Category>(cats));
            setPaymentMethods(normalizeList<PaymentMethodSettings>(pms));
            if (includeMembers) {
                // getStaff() (no page param) hits the shared, unfiltered /staff fallback used
                // elsewhere (e.g. Transactions dropdown, which needs inactive staff for history),
                // so filter to ACTIVE-only here for the POS member selector specifically.
                const activeStaff = normalizeList<Staff>(staff).filter((s: Staff) => (s.status || 'ACTIVE') === 'ACTIVE');
                setStaffList(activeStaff);
                setConsumerList(normalizeList<Consumer>(consumers));
            }
            hasDataRef.current = true;
            setLoadError(null);
        } catch (error: any) {
            // Cancelled requests (effect cleanup) are not failures — ignore them.
            if (isAbortError(error)) return;
            if (!isSilent) setLoadError(error?.message || 'Failed to load POS data');
        } finally {
            setLoading(false);
        }
    }, [branchId, includeMembers]);

    useEffect(() => {
        const controller = new AbortController();
        loadData(false, controller.signal);
        return () => controller.abort();
    }, [loadData]);

    // Safety: Clear cart when branch changes to prevent accidental cross-branch orders
    useEffect(() => {
        setCart([]);
    }, [branchId]);

    const posDataTypes = useMemo(
        () => includeMembers ? ['menu', 'consumer', 'staff', 'transaction'] as const : ['menu'] as const,
        [includeMembers]
    );

    useRealTimeUpdate({
        onUpdate: () => loadData(true),
        dataTypes: posDataTypes,
        branchId: branchId,
        debounceMs: 2000,
    });

    const addToCart = useCallback((item: MenuItem, quantity: number = 1) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i);
            }
            return [...prev, { ...item, quantity }];
        });
    }, []);

    const removeFromCart = useCallback((id: string) => {
        setCart(prev => prev.filter(i => i.id !== id));
    }, []);

    const updateQuantity = useCallback((id: string, delta: number) => {
        setCart(prev => prev.map(i => {
            if (i.id === id) {
                const newQty = Math.max(1, i.quantity + delta);
                return { ...i, quantity: newQty };
            }
            return i;
        }));
    }, []);

    const clearCart = useCallback(() => setCart([]), []);

    const cartTotal = useMemo(() =>
        cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
        , [cart]);

    return {
        menuItems,
        categories,
        paymentMethods,
        staffList,
        consumerList,
        cart,
        setCart,
        loading,
        printerMode,
        setPrinterMode,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        loadError,
        refreshData: loadData
    };
};
