import React, { useState, useEffect, useMemo, useCallback } from 'react';
import logger from '../utils/logger';
import ReactDOM from 'react-dom';
import { saveTransaction } from '../services/transactionService';
import { Transaction } from '../types';
import { Zap, Info } from 'lucide-react';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { usePOS } from '../hooks/usePOS';
import { printKOT, printDocument, openPrintWindow } from '../utils/printUtils';
import { CartSidebar } from './POS/CartSidebar';
import { POSHeader } from './POS/POSHeader';
import { POSMenuGrid } from './POS/POSMenuGrid';
import { POSNPaymentModal } from './POS/POSNPaymentModal';
import { useUI } from './ui/UIContext';
import { Button } from './ui/Button';
import { QRPaymentOverlay } from './shared/QRPaymentOverlay';
import {
    fetchStudentOrder,
    markStudentOrderLoaded,
    markStudentOrderCompleted,
    isValidOrderIdFormat,
} from '../services/studentOrderService';
import type { CartItem } from '../types';

import { formatCurrency } from '../utils/currency';
const POSN = () => {
    // ALL hooks must be called unconditionally before any early returns (Rules of Hooks)
    const { currentBranch, loading: branchLoading } = useBranch();
    const { user } = useAuth();
    const can = usePermission();
    const { showToast } = useUI();

    const isMainBranch = currentBranch?.name === 'Main Branch';

    const {
        menuItems,
        categories,
        paymentMethods: availablePaymentMethods,
        cart,
        loading,
        printerMode,
        setPrinterMode,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        setCart,
        cartTotal
    } = usePOS({
        branchId: currentBranch?.id,
        printerKey: 'printer_mode_posn'
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const todayPrefix = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-`;
    }, []);
    const [orderIdQuery, setOrderIdQuery] = useState(todayPrefix);
    const [isOrderSearching, setIsOrderSearching] = useState(false);
    // Student order currently in the cart; marked COMPLETED once checkout succeeds.
    const [loadedStudentOrderId, setLoadedStudentOrderId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

    const [amountPaid, setAmountPaid] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

    // Reset mobile cart on unmount (navigation away)
    useEffect(() => {
        return () => setIsMobileCartOpen(false);
    }, []);

    // QR Popup State
    const [isQRPopupOpen, setIsQRPopupOpen] = useState(false);
    const [pendingQRPaymentMethod, setPendingQRPaymentMethod] = useState<any | null>(null);

    useEffect(() => {
        const defaultMethod = availablePaymentMethods?.find(m => m.isDefault);
        if (defaultMethod) setPaymentMethod(defaultMethod.id);
    }, [availablePaymentMethods]);

    const categoryNames = useMemo(() => ['All', ...categories.map(c => c.name).sort()], [categories]);

    const filteredMenu = useMemo(() => menuItems.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
        return matchesSearch && matchesCategory;
    }).sort((a, b) => {
        if (a.isTodayMenu && !b.isTodayMenu) return -1;
        if (!a.isTodayMenu && b.isTodayMenu) return 1;
        return 0;
    }), [menuItems, searchQuery, categoryFilter]);

    const cartMap = useMemo(() => {
        const map = new Map<string, number>();
        cart.forEach(item => map.set(item.id, item.quantity));
        return map;
    }, [cart]);

    const handleOrderSearch = useCallback(async () => {
        const normalised = orderIdQuery.trim().toUpperCase();
        if (!normalised) return;

        if (!isValidOrderIdFormat(normalised)) {
            showToast('Invalid format. Expected: YYYY-MM-DD-NNNN (e.g. 2026-06-02-0001)', 'error');
            return;
        }

        if (!currentBranch?.id) {
            showToast('No active branch selected. Please select a branch from the header.', 'error');
            return;
        }

        setIsOrderSearching(true);
        try {
            const order = await fetchStudentOrder(normalised, currentBranch.id);

            if (order.status === 'CANCELLED') {
                showToast('This order has been cancelled.', 'error');
                return;
            }
            if (order.status === 'COMPLETED') {
                showToast('This order has already been completed.', 'error');
                return;
            }
            const cartItems: CartItem[] = order.items.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                category: item.category,
                quantity: item.quantity,
            }));

            await markStudentOrderLoaded(order.id, currentBranch.id).catch(() => {});
            setCart(cartItems);
            setLoadedStudentOrderId(order.id);
            setOrderIdQuery(todayPrefix);
            showToast(`Order ${normalised} loaded into cart`, 'success');
        } catch (err: any) {
            if (err.status === 404) {
                showToast('Order not found. Please check the Order ID.', 'error');
            } else {
                showToast(err.message ?? 'Failed to look up order.', 'error');
            }
        } finally {
            setIsOrderSearching(false);
        }
    }, [orderIdQuery, currentBranch?.id, setCart, showToast]);

    // An emptied cart (checkout, manual clear, or usePOS clearing it on branch switch)
    // no longer holds the loaded student order.
    useEffect(() => {
        if (cart.length === 0) setLoadedStudentOrderId(null);
    }, [cart.length]);

    // Auto-search when order ID reaches valid full format (YYYY-MM-DD-NNNN)
    useEffect(() => {
        if (isValidOrderIdFormat(orderIdQuery.trim())) {
            void handleOrderSearch();
        }
    }, [orderIdQuery, handleOrderSearch]);

    const handleCheckout = async () => {
        if (cart.length === 0 || isProcessing) return;

        setIsProcessing(true);
        try {
            if (!currentBranch?.id) {
                throw new Error("No active branch selected. Please select a branch from the header.");
            }
            const txId = crypto.randomUUID();

            const selectedMethod = availablePaymentMethods?.find(m => m.id === paymentMethod);
            const mopName = selectedMethod ? selectedMethod.name : (paymentMethod || 'Cash');

            const transaction: Transaction = {
                id: txId,
                staffId: 'POS-N',
                staffName: 'Standard Customer',
                items: cart,
                totalAmount: cartTotal,
                paymentMethod: mopName,
                type: 'POS-N',
                status: 'COMPLETED',
                branchId: currentBranch.id,
                timestamp: new Date().toISOString()
            };

            // Pre-open popup synchronously (user gesture) before any awaits
            const printWin = printerMode !== 'OFF' ? openPrintWindow() : null;

            await saveTransaction(transaction, currentBranch.id);

            if (loadedStudentOrderId) {
                // The sale is already saved — a failure here must not fail the checkout.
                await markStudentOrderCompleted(loadedStudentOrderId, currentBranch.id).catch(err =>
                    logger.error(`Failed to mark student order ${loadedStudentOrderId} as completed`, err));
            }

            try {
                if (printerMode === 'LOCAL') {
                    await printKOT(transaction, mopName, currentBranch.name || 'CafeFlow', 'LOCAL', user?.username || 'Admin', 'BILL', printWin);
                } else if (printerMode === 'NETWORK') {
                    await printDocument('BILL', transaction, user?.username || 'Admin', printWin);
                } else {
                    printWin?.close();
                }
            } catch (printErr) {
                logger.error("Printing failed but transaction saved", printErr);
                printWin?.close();
            }

            showToast(`Transaction saved: ${formatCurrency(cartTotal)}`, 'success');
            clearCart();
            setIsPaymentModalOpen(false);
            setIsQRPopupOpen(false);
            setPendingQRPaymentMethod(null);
            setAmountPaid('');

            const defaultMethod = availablePaymentMethods?.find(m => m.isDefault);
            if (defaultMethod) {
                setPaymentMethod(defaultMethod.id);
            } else {
                setPaymentMethod(null);
            }
        } catch (error) {
            logger.error("Checkout failed", error);
            showToast("Checkout failed: " + (error as any).message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const openPaymentModal = () => {
        if (cart.length === 0) return;
        const selectedMethod = availablePaymentMethods?.find(m => m.id === paymentMethod);
        if (selectedMethod && selectedMethod.type !== 'cash') {
            setAmountPaid(cartTotal.toFixed(2));
        } else {
            setAmountPaid('');
        }
        setIsPaymentModalOpen(true);
    };

    const attemptCheckout = () => {
        const selectedMethod = availablePaymentMethods?.find(m => m.id === paymentMethod);
        if (selectedMethod && selectedMethod.showQrInPos && selectedMethod.qrData) {
            setPendingQRPaymentMethod(selectedMethod);
            setIsQRPopupOpen(true);
            setIsPaymentModalOpen(false);
        } else {
            handleCheckout();
        }
    };

    // Early returns AFTER all hooks (Rules of Hooks requires hooks always run in same order)
    if (branchLoading) {
        return (
            <div className="flex items-center justify-center min-h-[500px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!currentBranch || !currentBranch.id || isMainBranch) {
        return (
            <div className="flex items-center justify-center min-h-[500px]">
                <div className="max-w-md text-center p-12 bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 flex flex-col items-center">
                    <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6">
                        <Info size={40} />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-tight">
                        {!currentBranch ? 'No Branch Selected' : 'Main Branch Restriction'}
                    </h3>
                    <p className="text-slate-500 font-medium leading-relaxed">
                        {!currentBranch
                            ? 'Please select an active branch from the top menu to proceed.'
                            : 'The POS system is reserved for active branch operations. Please switch to a specific branch to process transactions.'}
                    </p>
                </div>
            </div>
        );
    }

    if (!can('ACCESS_POS')) {
        return <div className="p-8 text-center text-red-500 font-bold">Access Denied</div>;
    }

    return (
        <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-2rem)] gap-6 p-4 sm:p-6 lg:p-8 bg-slate-50/30">
            <div className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
                <POSHeader
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={setCategoryFilter}
                    categoryNames={categoryNames}
                />

                <POSMenuGrid
                    loading={loading}
                    filteredMenu={filteredMenu}
                    cartMap={cartMap}
                    onAddToCart={addToCart}
                />
            </div>

            <CartSidebar
                variant="direct-checkout"
                cart={cart}
                cartTotal={cartTotal}
                printerMode={printerMode}
                setPrinterMode={setPrinterMode}
                isProcessing={isProcessing}
                onCheckout={openPaymentModal}
                onUpdateQuantity={updateQuantity}
                onRemoveItem={removeFromCart}
                clearCart={clearCart}
                orderIdQuery={orderIdQuery}
                onOrderIdChange={setOrderIdQuery}
                isOrderSearching={isOrderSearching}
            />

            <POSNPaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                total={cartTotal}
                amountPaid={amountPaid}
                setAmountPaid={setAmountPaid}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                availableMethods={availablePaymentMethods || []}
                onConfirm={attemptCheckout}
                isProcessing={isProcessing}
            />

            {/* QR Payment Popup Modal */}
            {isQRPopupOpen && pendingQRPaymentMethod && ReactDOM.createPortal(
                <QRPaymentOverlay
                    methodName={pendingQRPaymentMethod.name}
                    qrData={pendingQRPaymentMethod.qrData}
                    total={cartTotal}
                    isProcessing={isProcessing}
                    onConfirm={() => {
                        setIsQRPopupOpen(false);
                        handleCheckout();
                    }}
                    onCancel={() => {
                        setIsQRPopupOpen(false);
                        setIsPaymentModalOpen(true);
                    }}
                    backdropStyle={{ zIndex: 9999 }}
                />,
                document.body
            )}

            {cart.length > 0 && ReactDOM.createPortal(
                <div className="lg:hidden fixed bottom-6 left-4 right-4 bg-white border-2 border-slate-100 rounded-3xl z-[100] animate-in slide-in-from-bottom-5">
                    <div className="flex items-center justify-between p-5">
                        <div className="flex items-center gap-4">
                            <div className="relative p-3 bg-indigo-50 rounded-2xl">
                                <Zap className="w-6 h-6 text-indigo-600" />
                                <span className="absolute -top-2 -right-2 bg-slate-900 text-white text-[10px] font-bold rounded-lg min-w-[20px] h-5 px-1 flex items-center justify-center border-2 border-white">
                                    {cart.reduce((acc, item) => acc + item.quantity, 0)}
                                </span>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Payable</p>
                                <p className="font-bold text-slate-900 tabular-nums tracking-tighter text-lg">{formatCurrency(cartTotal)}</p>
                            </div>
                        </div>
                        <Button
                            onClick={() => setIsMobileCartOpen(true)}
                            className="h-14 px-8 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest transition-all active:scale-95"
                        >
                            View Cart
                        </Button>
                    </div>
                </div>,
                document.body
            )}

            {isMobileCartOpen && (
                <CartSidebar
                    variant="direct-checkout"
                    isMobile
                    cart={cart}
                    cartTotal={cartTotal}
                    printerMode={printerMode}
                    setPrinterMode={setPrinterMode}
                    clearCart={clearCart}
                    isProcessing={isProcessing}
                    onCheckout={() => { setIsMobileCartOpen(false); openPaymentModal(); }}
                    onUpdateQuantity={updateQuantity}
                    onRemoveItem={removeFromCart}
                    onCloseMobile={() => setIsMobileCartOpen(false)}
                    orderIdQuery={orderIdQuery}
                    onOrderIdChange={setOrderIdQuery}
                    onOrderSearch={handleOrderSearch}
                    isOrderSearching={isOrderSearching}
                />
            )}

        </div>
    );
};

export default POSN;
