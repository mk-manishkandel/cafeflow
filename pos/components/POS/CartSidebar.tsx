import React from 'react';
import clsx from 'clsx';
import { ShoppingCart, CreditCard, Zap, X, RotateCcw, Search, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Input } from '../ui/Input';
import { CartItem, Staff, Consumer } from '../../types';
import { CartItemRow } from './CartItemRow';
import { PrinterToggle, PrinterMode } from './PrinterToggle';
import { MemberSelector } from './MemberSelector';
import { Button } from '../ui/Button';
import { ConfirmationModal } from '../shared/ConfirmationModal';

import { CURRENCY_SYMBOL } from '../../utils/currency';
/**
 * Variant determines the mode of operation:
 * - 'member-checkout': POS mode with member selection required (staff/consumer)
 * - 'direct-checkout': POS-N mode without member selection, direct payment
 */
export type CartSidebarVariant = 'member-checkout' | 'direct-checkout';

interface CartSidebarProps {
    // Core cart data
    cart: CartItem[];
    cartTotal: number;

    // Variant determines behavior
    variant?: CartSidebarVariant;

    // Member selection (required for 'member-checkout' variant)
    selectedMember?: Staff | Consumer | null;
    onSelectMember?: (member: Staff | Consumer | null) => void;
    staffList?: Staff[];
    consumerList?: Consumer[];
    memberSearchQuery?: string;
    onMemberSearchChange?: (query: string) => void;
    isMemberDropdownOpen?: boolean;
    setIsMemberDropdownOpen?: (open: boolean) => void;
    memberDropdownRef?: React.RefObject<HTMLDivElement>;

    // Printer settings
    printerMode: PrinterMode;
    setPrinterMode: (mode: PrinterMode) => void;

    // Actions
    isProcessing: boolean;
    onCheckout: () => void;
    onUpdateQuantity: (itemId: string, delta: number) => void;
    onRemoveItem: (itemId: string) => void;
    clearCart: () => void;

    // Order ID search (POS-N only)
    orderIdQuery?: string;
    onOrderIdChange?: (val: string) => void;
    onOrderSearch?: () => void;
    isOrderSearching?: boolean;

    // Mobile support
    isMobile?: boolean;
    onCloseMobile?: () => void;
}

export const CartSidebar: React.FC<CartSidebarProps> = (props) => {
    const {
        cart,
        cartTotal,
        variant = 'member-checkout', // Default to member-checkout for backward compatibility
        selectedMember,
        onSelectMember,
        staffList = [],
        consumerList = [],
        memberSearchQuery = '',
        onMemberSearchChange,
        isMemberDropdownOpen = false,
        setIsMemberDropdownOpen,
        printerMode,
        setPrinterMode,
        isProcessing,
        onCheckout,
        onUpdateQuantity,
        onRemoveItem,
        clearCart,
        isMobile = false,
        onCloseMobile,
        memberDropdownRef,
        orderIdQuery = '',
        onOrderIdChange,
        onOrderSearch,
        isOrderSearching = false,
    } = props;

    const [isResetModalOpen, setIsResetModalOpen] = React.useState(false);

    // Determine if member selection is required
    const requiresMemberSelection = variant === 'member-checkout';

    // Determine checkout button disabled state
    const isCheckoutDisabled = cart.length === 0 ||
        (requiresMemberSelection && !selectedMember) ||
        isProcessing;

    // Body scroll lock on mobile
    React.useEffect(() => {
        if (isMobile) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.height = '100%';
            return () => {
                document.body.style.overflow = '';
                document.body.style.position = '';
                document.body.style.width = '';
                document.body.style.height = '';
            };
        }
    }, [isMobile]);

    const cartContent = (
        <div className="flex flex-col flex-1 overflow-hidden bg-white">
            {/* Header */}
            <div className="p-4 lg:p-5 border-b border-slate-100 shrink-0 bg-white">
                <div className="flex flex-col lg:flex-row justify-between items-center gap-3 mb-3">
                    <div className="flex flex-col lg:flex-row items-center gap-3 text-center lg:text-left">
                        <div className="p-2.5 bg-slate-900 rounded-xl text-white shadow-lg shadow-slate-200">
                            {isMobile ? <ShoppingCart className="w-5 h-5" /> :
                             variant === 'direct-checkout' ? <ShoppingCart className="w-5 h-5" /> :
                             <Zap className="w-5 h-5" />}
                        </div>
                        <div>
                            <h2 className="font-black text-lg lg:text-base text-slate-900 uppercase tracking-tight leading-none">
                                {isMobile ? 'Your Cart' :
                                 variant === 'direct-checkout' ? 'Checkout' :
                                 'New Sale'}
                            </h2>
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Terminal Active</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 w-full lg:w-auto justify-center">
                        <PrinterToggle mode={printerMode} setMode={setPrinterMode} />
                        {isMobile && onCloseMobile && (
                            <button
                                onClick={onCloseMobile}
                                className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-90"
                                aria-label="Close cart sidebar"
                            >
                                <X size={20} strokeWidth={2.5} aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Member Selector - shown whenever onSelectMember is provided */}
                {onSelectMember && onMemberSearchChange && setIsMemberDropdownOpen && (
                    <MemberSelector
                        staffList={staffList}
                        consumerList={consumerList}
                        selectedMember={selectedMember || null}
                        onSelect={onSelectMember}
                        searchQuery={memberSearchQuery}
                        onSearchChange={onMemberSearchChange}
                        isDropdownOpen={isMemberDropdownOpen}
                        setIsDropdownOpen={setIsMemberDropdownOpen}
                        cartTotal={cartTotal}
                        dropdownRef={memberDropdownRef}
                    />
                )}

                {/* Order ID Search - POS-N only */}
                {onOrderIdChange && (
                    <div className="mt-3">
                        <Input
                            type="text"
                            placeholder="Search Order ID..."
                            value={orderIdQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onOrderIdChange(e.target.value)}
                            disabled={isOrderSearching}
                            leftIcon={<Search className="text-slate-400 w-4 h-4" aria-hidden="true" />}
                            rightIcon={isOrderSearching ? <Loader2 size={16} className="animate-spin text-indigo-500" /> : undefined}
                            inputClassName="h-11 font-mono tracking-wider uppercase !text-sm"
                        />
                    </div>
                )}
            </div>

            {/* Cart Items - Scrollable middle section */}
            <div className={clsx(
                "flex-1 bg-white flex flex-col custom-scrollbar",
                cart.length === 0 ? "overflow-hidden" : "p-4 space-y-2 overflow-y-auto"
            )}>
                {cart.map(item => (
                    <CartItemRow
                        key={item.id}
                        item={item}
                        onUpdate={onUpdateQuantity}
                        onRemove={onRemoveItem}
                    />
                ))}
                {cart.length === 0 && (
                    <div className="m-auto flex flex-col items-center justify-center text-slate-300 space-y-4 opacity-50 select-none">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                            <ShoppingCart size={40} />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-lg text-slate-400">Your cart is empty</p>
                            <p className="text-xs font-bold text-slate-300">Add items to begin</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer - Total and Actions */}
            <div className="p-4 lg:p-5 bg-white border-t border-slate-100 shrink-0">
                <div className="flex justify-between items-end mb-4">
                    <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                            {cart.reduce((a, c) => a + c.quantity, 0)} Items
                        </span>
                    </div>
                    <div className="space-y-0.5 text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block">
                            Total Payable
                        </span>
                        <div className="flex items-baseline justify-end gap-1">
                            <span className="text-xs font-bold text-slate-400">{CURRENCY_SYMBOL}</span>
                            <span className="text-2xl font-black text-slate-900 tabular-nums tracking-tighter leading-none">
                                {cartTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-3">
                    {cart.length > 0 && (
                        <Button
                            variant="ghost"
                            onClick={() => setIsResetModalOpen(true)}
                            aria-label="Reset cart"
                            className="w-12 h-12 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all shrink-0 border border-red-100"
                        >
                            <RotateCcw size={18} strokeWidth={2.5} aria-hidden="true" />
                        </Button>
                    )}
                    <Button
                        onClick={onCheckout}
                        disabled={isCheckoutDisabled}
                        isLoading={isProcessing}
                        className="flex-1 h-12 bg-slate-900 text-white rounded-xl font-black text-base uppercase tracking-[0.1em] transition-all transform active:scale-[0.98] shadow-lg shadow-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        leftIcon={!isProcessing && <CreditCard size={20} strokeWidth={2.5} />}
                    >
                        Checkout Now
                    </Button>
                </div>
            </div>

            <ConfirmationModal
                isOpen={isResetModalOpen}
                onClose={() => setIsResetModalOpen(false)}
                onConfirm={() => {
                    clearCart();
                    setIsResetModalOpen(false);
                }}
                title="Reset Terminal Cart"
                message="Are you sure you want to clear all items from the terminal? This action cannot be undone."
                confirmText="Reset Now"
                cancelText="Cancel"
                variant="danger"
            />
        </div>
    );

    if (isMobile) {
        return createPortal(
            <div className="lg:hidden fixed inset-0 h-[100dvh] z-[150] bg-white flex flex-col overflow-hidden overscroll-none touch-none animate-in slide-in-from-bottom-5 duration-300">
                {/* Header - SHRINK-0 */}
                <div className="shrink-0 p-4 pb-10 border-b border-slate-100 bg-white z-30">
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-3">
                            {onCloseMobile && (
                                <button
                                    onClick={onCloseMobile}
                                    className="p-2 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
                                    aria-label="Back to menu"
                                >
                                    <X size={20} strokeWidth={2.5} />
                                </button>
                            )}
                            <div className="p-2.5 bg-slate-900 rounded-xl text-white shadow-lg flex items-center justify-center">
                                <ShoppingCart className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="font-black text-lg text-slate-900 uppercase tracking-tight leading-none">Your Cart</h2>
                                <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Terminal Active</p>
                            </div>
                        </div>
                        <PrinterToggle mode={printerMode} setMode={setPrinterMode} />
                    </div>

                    {onSelectMember && onMemberSearchChange && setIsMemberDropdownOpen && (
                        <MemberSelector
                            staffList={staffList}
                            consumerList={consumerList}
                            selectedMember={selectedMember || null}
                            onSelect={onSelectMember}
                            searchQuery={memberSearchQuery}
                            onSearchChange={onMemberSearchChange}
                            isDropdownOpen={isMemberDropdownOpen}
                            setIsDropdownOpen={setIsMemberDropdownOpen}
                            cartTotal={cartTotal}
                            dropdownRef={memberDropdownRef}
                        />
                    )}

                    {/* Order ID Search - POS-N mobile */}
                    {onOrderSearch && (
                        <div className="flex gap-2 mt-3">
                            <Input
                                type="text"
                                placeholder="Search Order ID..."
                                value={orderIdQuery}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onOrderIdChange?.(e.target.value)}
                                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') onOrderSearch(); }}
                                disabled={isOrderSearching}
                                leftIcon={<Search className="text-slate-400 w-4 h-4" aria-hidden="true" />}
                                inputClassName="h-11 font-mono tracking-wider uppercase !text-sm"
                            />
                            <button
                                onClick={onOrderSearch}
                                disabled={isOrderSearching || !orderIdQuery.trim()}
                                aria-label="Look up order"
                                className="h-11 w-11 flex items-center justify-center bg-slate-900 text-white rounded-xl shrink-0 disabled:opacity-40 transition-all active:scale-95"
                            >
                                {isOrderSearching
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : <Search size={16} />}
                            </button>
                        </div>
                    )}
                </div>

                {/* Cart Items - FLEX-1 (Expands to fill available space) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                    <div className={clsx(
                        "flex flex-col",
                        cart.length === 0 ? "min-h-full" : "p-4 space-y-2"
                    )}>
                        {cart.map(item => (
                            <CartItemRow
                                key={item.id}
                                item={item}
                                onUpdate={onUpdateQuantity}
                                onRemove={onRemoveItem}
                            />
                        ))}
                        {cart.length === 0 && (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 space-y-4 opacity-50 select-none py-20">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                                    <ShoppingCart size={40} />
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-lg text-slate-400">Your cart is empty</p>
                                    <p className="text-xs font-bold text-slate-300">Add items to begin</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer - SHRINK-0 (Pinned to bottom) */}
                <div className="shrink-0 px-4 py-5 bg-white border-t border-slate-100 z-30 shadow-[0_-5px_20px_-15px_rgba(0,0,0,0.1)]">
                    <div className="flex justify-between items-end mb-4">
                        <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center justify-center">
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                                {cart.reduce((a, c) => a + c.quantity, 0)} Items
                            </span>
                        </div>
                        <div className="space-y-2 text-right">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block">
                                Total Payable
                            </span>
                            <div className="flex items-baseline justify-end gap-1">
                                <span className="text-xs font-bold text-slate-400">{CURRENCY_SYMBOL}</span>
                                <span className="text-2xl font-black text-slate-900 tabular-nums tracking-tighter leading-none">
                                    {cartTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {cart.length > 0 && (
                            <Button
                                variant="ghost"
                                onClick={() => setIsResetModalOpen(true)}
                                aria-label="Reset cart"
                                className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-all shrink-0 border border-red-100"
                            >
                                <RotateCcw size={20} strokeWidth={2.5} aria-hidden="true" />
                            </Button>
                        )}
                        <Button
                            onClick={onCheckout}
                            disabled={isCheckoutDisabled}
                            isLoading={isProcessing}
                            className="flex-1 h-14 bg-slate-900 text-white rounded-2xl font-black text-base uppercase tracking-[0.1em] transition-all transform active:scale-[0.98] shadow-lg shadow-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                            leftIcon={!isProcessing && <CreditCard size={20} strokeWidth={2.5} />}
                        >
                            Checkout Now
                        </Button>
                    </div>
                </div>

                <ConfirmationModal
                    isOpen={isResetModalOpen}
                    onClose={() => setIsResetModalOpen(false)}
                    onConfirm={() => {
                        clearCart();
                        setIsResetModalOpen(false);
                    }}
                    title="Reset Terminal Cart"
                    message="Are you sure you want to clear all items from the terminal? This action cannot be undone."
                    confirmText="Reset Now"
                    cancelText="Cancel"
                    variant="danger"
                />
            </div>,
            document.body
        );
    }

    return (
        <div className="hidden lg:flex w-[400px] bg-white rounded-3xl border border-slate-200 flex-col h-full overflow-hidden">
            {cartContent}
        </div>
    );
};

export default CartSidebar;
