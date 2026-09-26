import React, { useState } from 'react';
import { CreditCard, Building2, Printer, Shield, Mail, Settings, Layout, FileText } from 'lucide-react';
import { PageHeader } from './shared/PageHeader';
import BranchManager from './BranchManager';
import { usePermission } from '../hooks/usePermission';

// Sub-components
import { PaymentMethodsSetting } from './BusinessSetup/PaymentMethodsSetting';
import { PrinterSettings } from './BusinessSetup/PrinterSettings';
import { EmailSettings } from './BusinessSetup/EmailSettings';
import { ApiKeyManager } from './BusinessSetup/ApiKeyManager';
import { EmailTemplatesSettings } from './BusinessSetup/EmailTemplatesSettings';
import { DocumentTemplatesSettings } from './BusinessSetup/DocumentTemplatesSettings';

const BusinessSetup = () => {
    const [activeTab, setActiveTab] = useState<'branches' | 'payment' | 'printer' | 'api-keys' | 'email' | 'templates' | 'documents'>('payment');
    const can = usePermission();

    const allTabs = [
        { id: 'payment' as const, label: 'Payment Methods', icon: CreditCard, perm: 'MANAGE_PAYMENT_METHODS' },
        { id: 'branches' as const, label: 'Branches', icon: Building2, perm: 'MANAGE_BRANCHES' },
        { id: 'printer' as const, label: 'Printer Setup', icon: Printer, perm: 'MANAGE_BRANCHES' }, // Printer uses branch permission
        { id: 'api-keys' as const, label: 'API Keys', icon: Shield, perm: 'MANAGE_API_KEYS' },
        { id: 'email' as const, label: 'Email Configuration', icon: Mail, perm: 'MANAGE_EMAIL_CONFIG' },
        { id: 'templates' as const, label: 'Email Templates', icon: Layout, perm: 'MANAGE_EMAIL_TEMPLATES' },
        { id: 'documents' as const, label: 'Document Templates', icon: FileText, perm: 'MANAGE_EMAIL_TEMPLATES' }
    ];

    const tabs = allTabs.filter(tab => {
        return !tab.perm || can(tab.perm);
    });

    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [startX, setStartX] = React.useState(0);
    const [scrollLeft, setScrollLeft] = React.useState(0);
    const [draggedDistance, setDraggedDistance] = React.useState(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDraggedDistance(0);
        if (scrollContainerRef.current) {
            setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
            setScrollLeft(scrollContainerRef.current.scrollLeft);
        }
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollContainerRef.current.offsetLeft;
        const walk = (x - startX) * 2; // scroll-fast multiplier
        scrollContainerRef.current.scrollLeft = scrollLeft - walk;
        setDraggedDistance(Math.abs(walk));
    };

    const handleTabClick = (tabId: any, e: React.MouseEvent) => {
        if (draggedDistance > 5) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        setActiveTab(tabId);
    };

    // Handle initial tab selection if 'payment' is not available
    React.useEffect(() => {
        if (tabs.length > 0 && !tabs.find(t => t.id === activeTab)) {
            setActiveTab(tabs[0].id);
        }
    }, [tabs, activeTab]);

    if (tabs.length === 0) {
        return <div className="p-8 text-center text-red-500">Access Denied</div>;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <PageHeader
                title="Business Setup"
                subtitle="Configure your business settings, branches, and payments."
                icon={Settings}
            />

            <div className="flex flex-col gap-6 mt-6">
                {/* Horizontal Navigation Tabs (Pill style) */}
                <div className="w-full max-w-full relative mb-4 min-w-0">
                    <div
                        ref={scrollContainerRef}
                        onMouseDown={handleMouseDown}
                        onMouseLeave={handleMouseLeave}
                        onMouseUp={handleMouseUp}
                        onMouseMove={handleMouseMove}
                        className={`flex flex-row flex-nowrap gap-2 overflow-x-auto pb-4 pt-2.5 sm:pt-3 pr-6 no-scrollbar ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    >
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={(e) => handleTabClick(tab.id, e)}
                                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-sm font-semibold whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                <tab.icon size={16} className={activeTab === tab.id ? 'text-white' : 'text-slate-500'} />
                                {tab.label}
                            </button>
                        ))}
                        {/* Spacer to allow fully scrolling past the right-side fade mask */}
                        <div className="w-4 shrink-0 sm:w-8"></div>
                    </div>
                </div>

                {/* Content Area - Full Width */}
                <div className="w-full min-w-0">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 animate-in fade-in duration-100">
                        {activeTab === 'payment' && <PaymentMethodsSetting />}
                        {activeTab === 'branches' && (
                            <div className="prose max-w-none">
                                <BranchManager showHeader={false} />
                            </div>
                        )}
                        {activeTab === 'printer' && <PrinterSettings />}
                        {activeTab === 'api-keys' && <ApiKeyManager />}
                        {activeTab === 'email' && <EmailSettings />}
                        {activeTab === 'templates' && <EmailTemplatesSettings />}
                        {activeTab === 'documents' && <DocumentTemplatesSettings />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BusinessSetup;
