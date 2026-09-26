import React from 'react';
import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../ui/Button';

interface ActionButton {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    disabled?: boolean;
    hidden?: boolean;
    isLoading?: boolean;
    className?: string;
}

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    description?: string; // Legacy support
    icon?: LucideIcon | React.ReactNode;
    actions?: ActionButton[] | React.ReactNode;
    children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    description,
    icon: Icon,
    actions = [],
    children
}) => {
    const renderIcon = () => {
        if (!Icon) return null;
        if (typeof Icon === 'function' || (typeof Icon === 'object' && Icon !== null && (Icon as any).$$typeof)) {
            const IconComp = Icon as any;
            return <IconComp size={24} />;
        }
        return Icon;
    };

    const renderActions = () => {
        if (!actions) return null;
        if (Array.isArray(actions)) {
            return actions.filter(a => !a.hidden).map((action, idx) => {
                const ActionIcon = action.icon;
                return (
                    <Button
                        key={action.label ?? idx}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        variant={action.variant || 'primary'}
                        className={clsx(
                            "h-11 shadow-sm whitespace-nowrap",
                            action.className
                        )}
                        isLoading={action.isLoading}
                        leftIcon={ActionIcon && !action.isLoading ? <ActionIcon size={18} /> : undefined}
                    >
                        <span className="hidden sm:inline">{action.label}</span>
                    </Button>
                );
            });
        }
        return actions;
    };

    return (
        <div className="mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6 flex-wrap">
            <div className="flex-1 w-full sm:w-auto">
                <div className="flex items-center gap-3 sm:gap-4 mb-1 sm:mb-2 flex-wrap">
                    {Icon && (
                        <div className="p-2 sm:p-2.5 bg-indigo-50 text-indigo-600 rounded-xl sm:rounded-2xl shrink-0 shadow-sm border border-indigo-100/50">
                            {renderIcon()}
                        </div>
                    )}
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight whitespace-nowrap">{title}</h1>
                </div>
                {(subtitle || description) && (
                    <p className="text-slate-500 text-sm lg:text-base ml-0 lg:ml-14 max-w-4xl leading-relaxed">
                        {subtitle || description}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto sm:justify-end shrink-0 mt-2 sm:mt-0">
                {children}
                {Array.isArray(actions) && actions.length > 0 && (
                    <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                        {renderActions()}
                    </div>
                )}
            </div>
        </div>
    );
};
