import React from 'react';
import { LucideIcon, Search } from 'lucide-react';
import clsx from 'clsx';

interface EmptyStateProps {
    icon?: LucideIcon;
    title?: string;
    description?: string;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon = Search,
    title = "No results found",
    description = "Try adjusting your search or filters to find what you're looking for.",
    className
}) => {
    return (
        <div className={clsx("flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-300", className)}>
            <div className="p-4 bg-slate-50 text-slate-300 rounded-full mb-4">
                <Icon size={48} className="opacity-50" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">{title}</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">{description}</p>
        </div>
    );
};
