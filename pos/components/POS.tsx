import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import ReactDOM from 'react-dom';
import { saveTransaction } from '../services/transactionService';
import { MenuItem, Transaction, Staff, Consumer } from '../types';

/** Staff or Consumer augmented with a discriminator tag added by MemberSelector */
type POSMember = (Staff & { memberType: 'staff' }) | (Consumer & { memberType: 'consumer' });
import { ShoppingCart, Info, RefreshCcw, AlertTriangle } from 'lucide-react';
import { useBranch } from '../contexts/BranchContext';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { usePOS } from '../hooks/usePOS';
import { printKOT, printDocument, openPrintWindow } from '../utils/printUtils';
import { POSHeader } from './POS/POSHeader';
import { POSMenuGrid } from './POS/POSMenuGrid';
import { CartSidebar } from './POS/CartSidebar';
import { POSCustomItemModal } from './POS/POSCustomItemModal';
import { LiveRegion } from './shared/LiveRegion';
import { useUI } from './ui/UIContext';
import { Button } from './ui/Button';

import { formatCurrency } from '../utils/currency';
const POS = () => {
  const { currentBranch } = useBranch();
  const { user } = useAuth();
  const can = usePermission();
  const { showToast } = useUI();

  const {
    menuItems,
    categories,
    staffList,
    consumerList,
    cart,
    setCart,
    loading,
    loadError,
    printerMode,
    setPrinterMode,
    addToCart,
    removeFromCart: _removeFromCart,
    updateQuantity,
    cartTotal,
    clearCart,
    refreshData: loadData
  } = usePOS({
    branchId: currentBranch?.id,
    printerKey: 'printer_mode_pos',
    includeMembers: true
  });

  // UI & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<POSMember | null>(null);
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const staffDropdownRef = useRef<HTMLDivElement>(null);
  const mobileStaffDropdownRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when mobile cart overlay is open
  useEffect(() => {
    if (isMobileCartOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileCartOpen]);

  // Announce cart changes to screen readers
  useEffect(() => {
    if (cart.length > 0) {
      const itemCount = cart.reduce((acc, item) => acc + item.quantity, 0);
      setLiveAnnouncement(`Cart updated. ${itemCount} items. Total: ${formatCurrency(cartTotal)}`);
    }
  }, [cart.length, cartTotal]);

  // Events
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const desktopRef = staffDropdownRef.current;
      const mobileRef = mobileStaffDropdownRef.current;
      if (desktopRef && !desktopRef.contains(event.target as Node) &&
        (!mobileRef || !mobileRef.contains(event.target as Node))) {
        setIsMemberDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Computed
  const categoryNames = useMemo(() => ['All', ...categories.map(c => c.name).sort()], [categories]);

  const filteredMenu = useMemo(() => menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => (a.isTodayMenu === b.isTodayMenu ? 0 : a.isTodayMenu ? -1 : 1)), [menuItems, debouncedSearchQuery, categoryFilter]);

  const cartMap = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => map.set(item.id, item.quantity));
    return map;
  }, [cart]);

  const handleAddCustomItem = useCallback((
    items: Array<{ name: string; price: number; quantity: number; remarks: string }>,
    eventName: string,
    eventBy: string
  ) => {
    const eventPrefix = [eventName, eventBy ? `by ${eventBy}` : ''].filter(Boolean).join(' ');
    items.forEach(({ name, price, quantity, remarks }) => {
      const noteParts = [remarks.trim(), eventPrefix].filter(Boolean);
      const finalName = noteParts.length ? `${name} (${noteParts.join(' · ')})` : name;
      const customItem: MenuItem = {
        id: `custom-${crypto.randomUUID()}`,
        name: finalName,
        price,
        category: 'Custom Item',
        isTodayMenu: false,
        available: true,
      };
      addToCart(customItem, quantity);
    });
    setIsCustomItemModalOpen(false);
  }, [addToCart]);

  const handleCheckout = useCallback(async () => {
    if (!selectedMember || cart.length === 0) return;
    setIsProcessing(true);
    let printWin: Window | null = null;
    try {
      const isConsumer = selectedMember.memberType === 'consumer';
      const transaction: Transaction = {
        id: crypto.randomUUID(),
        staffId: isConsumer ? '' : selectedMember.id,
        consumerId: isConsumer ? selectedMember.id : undefined,
        staffName: selectedMember.name,
        items: cart,
        totalAmount: cartTotal,
        timestamp: new Date().toISOString(),
        branchId: currentBranch?.id,
        paymentMethod: 'CREDIT'
      };

      // Pre-open popup synchronously (user gesture) before any awaits
      printWin = printerMode !== 'OFF' ? openPrintWindow() : null;

      await saveTransaction(transaction, currentBranch?.id);

      const hasCustomItems = cart.some(i => i.category === 'Custom Item');
      let printSucceeded = true;
      if (printerMode === 'LOCAL') {
        // LOCAL: client renders template + opens print dialog — no DB printer needed
        const templateType = hasCustomItems ? 'CUSTOM_ORDER' : 'BILL';
        printSucceeded = await printKOT(transaction, 'CREDIT', currentBranch?.name || 'CafeFlow', 'LOCAL', user?.username || 'Admin', templateType, printWin);
      } else if (printerMode === 'NETWORK') {
        // NETWORK: server resolves printer, renders template, prints via TCP
        const serviceType = hasCustomItems ? 'CUSTOM_ORDER' : 'BILL';
        printSucceeded = await printDocument(serviceType, transaction, user?.username || 'Admin', printWin);
      } else {
        printWin?.close();
      }

      setCart([]);
      setSelectedMember(null);
      setMemberSearch('');
      setIsMobileCartOpen(false);
      if (printSucceeded) {
        showToast('Transaction completed successfully!', 'success');
      } else {
        showToast('Sale saved — PRINT FAILED. Retry from Printer Settings.', 'error');
      }
    } catch (err) {
      printWin?.close();
      const message = err instanceof Error ? err.message : 'Unknown error';
      showToast("Checkout Failed: " + message, 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedMember, cart, cartTotal, currentBranch, printerMode, user, showToast, loadData]);

  if (!can('ACCESS_POS')) return <div className="p-8 text-center text-red-500 font-bold">Access Denied</div>;

  if (loadError && !loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="max-w-md text-center p-12 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col items-center">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mb-6">
            <AlertTriangle size={40} />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-tight">Failed to Load POS</h3>
          <p className="text-slate-500 font-medium leading-relaxed mb-6">{loadError}</p>
          <Button onClick={() => loadData()} className="flex items-center gap-2">
            <RefreshCcw size={16} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isMainBranch = currentBranch?.name === 'Main Branch';
  if (isMainBranch) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="max-w-md text-center p-12 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col items-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6">
            <Info size={40} />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-tight">Main Branch Restriction</h3>
          <p className="text-slate-500 font-medium leading-relaxed">
            The POS system is reserved for active branch operations. Please switch to a specific branch to process transactions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-2rem)] gap-6 p-4 sm:p-6 lg:p-8 bg-slate-50/30 animate-in fade-in animate-gpu duration-100">
      {/* Live region for cart announcements */}
      <LiveRegion message={liveAnnouncement} priority="polite" clearAfter={2000} />

      <div id="pos-menu" className="flex-1 flex flex-col bg-white rounded-3xl border border-slate-200 overflow-hidden min-h-[500px]">
        <POSHeader
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          categoryNames={categoryNames}
          onAddCustomItemClick={() => setIsCustomItemModalOpen(true)}
        />
        <POSMenuGrid
          loading={loading}
          filteredMenu={filteredMenu}
          cartMap={cartMap}
          onAddToCart={addToCart}
        />
      </div>

      <aside id="cart-sidebar" aria-label="Shopping cart">
        <CartSidebar
          variant="member-checkout"
          cart={cart}
          cartTotal={cartTotal}
          selectedMember={selectedMember}
          onSelectMember={setSelectedMember}
          staffList={staffList}
          consumerList={consumerList}
          memberSearchQuery={memberSearch}
          onMemberSearchChange={setMemberSearch}
          isMemberDropdownOpen={isMemberDropdownOpen}
          setIsMemberDropdownOpen={setIsMemberDropdownOpen}
          printerMode={printerMode}
          setPrinterMode={setPrinterMode}
          clearCart={clearCart}
          isProcessing={isProcessing}
          onCheckout={handleCheckout}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={(id) => setCart(prev => prev.filter(i => i.id !== id))}
          memberDropdownRef={staffDropdownRef}
        />
      </aside>

      {isMobileCartOpen && (
        <CartSidebar
          variant="member-checkout"
          isMobile
          cart={cart}
          cartTotal={cartTotal}
          selectedMember={selectedMember}
          onSelectMember={setSelectedMember}
          staffList={staffList}
          consumerList={consumerList}
          memberSearchQuery={memberSearch}
          onMemberSearchChange={setMemberSearch}
          isMemberDropdownOpen={isMemberDropdownOpen}
          setIsMemberDropdownOpen={setIsMemberDropdownOpen}
          printerMode={printerMode}
          setPrinterMode={setPrinterMode}
          clearCart={clearCart}
          isProcessing={isProcessing}
          onCheckout={handleCheckout}
          onUpdateQuantity={updateQuantity}
          onRemoveItem={(id) => setCart(prev => prev.filter(i => i.id !== id))}
          onCloseMobile={() => setIsMobileCartOpen(false)}
          memberDropdownRef={mobileStaffDropdownRef}
        />
      )}

      {/* POS-N Style Bottom Bar */}
      {cart.length > 0 && !isMobileCartOpen && ReactDOM.createPortal(
        <div className="lg:hidden fixed bottom-6 left-4 right-4 bg-white border-2 border-slate-100 rounded-3xl z-[100] animate-in slide-in-from-bottom-5">
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-4">
              <div className="relative p-3 bg-indigo-50 rounded-2xl">
                <ShoppingCart className="w-6 h-6 text-indigo-600" />
                <span className="absolute -top-2 -right-2 bg-slate-900 text-white text-[10px] font-bold rounded-lg min-w-[20px] h-5 px-1 flex items-center justify-center border-2 border-white">
                  {cart.reduce((acc, item) => acc + item.quantity, 0)}
                </span>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total</p>
                <p className="font-bold text-slate-900 tabular-nums tracking-tighter text-lg">{formatCurrency(cartTotal)}</p>
              </div>
            </div>
            <Button
              onClick={() => setIsMobileCartOpen(true)}
              className="h-14 px-8 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest transform active:scale-95 transition-all"
            >
              View Cart
            </Button>
          </div>
        </div>,
        document.body
      )}

      <POSCustomItemModal
        isOpen={isCustomItemModalOpen}
        onClose={() => setIsCustomItemModalOpen(false)}
        onAdd={handleAddCustomItem}
        menuItems={menuItems}
        staffList={staffList}
        consumerList={consumerList}
      />
    </div>
  );
};

export default POS;