import React from 'react';
import { NavLink } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';

interface NavItemProps {
    to: string;
    icon: LucideIcon;
    label: string;
    isCollapsed: boolean;
    onClick?: () => void;
    onMouseEnter?: () => void;
}

export const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, isCollapsed, onClick, onMouseEnter }) => {
    return (
        <NavLink
            to={to}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            title={isCollapsed ? label : ""}
            className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 ${isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600'
                } ${isCollapsed ? 'justify-center px-2' : ''}`
            }
        >
            <Icon size={20} className="shrink-0" />
            {!isCollapsed && <span className="font-medium whitespace-nowrap animate-in fade-in duration-200">{label}</span>}
        </NavLink>
    );
};
