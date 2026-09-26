import React from 'react';
import { LucideIcon, ChevronDown } from 'lucide-react';

interface NavGroupProps {
    icon: LucideIcon;
    label: string;
    isCollapsed: boolean;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

export const NavGroup: React.FC<NavGroupProps> = ({ icon: Icon, label, isCollapsed, isOpen, onToggle, children }) => {
    return (
        <div className="mt-6">
            <div className="mb-2 border-t border-slate-100 mx-2"></div>
            <button
                type="button"
                onClick={onToggle}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 ${isCollapsed ? 'justify-center px-2' : 'justify-between'}`}
                title={isCollapsed ? label : `Click to expand ${label}`}
            >
                <div className="flex items-center gap-3">
                    <Icon size={20} className="shrink-0" />
                    {!isCollapsed && <span className="font-medium">{label}</span>}
                </div>
                {!isCollapsed && <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />}
            </button>

            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen && !isCollapsed ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="mt-1 space-y-1 pl-4">
                    {children}
                </div>
            </div>
        </div>
    );
};
