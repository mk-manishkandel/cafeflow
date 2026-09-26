import React from 'react';

interface UserAvatarProps {
    name: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const COLORS = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500',
    'bg-rose-500'
];

const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COLORS.length;
    return COLORS[index];
};

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, size = 'md', className = '' }) => {
    const initials = getInitials(name);
    const bgColor = getColor(name || 'default');

    const sizeClasses = {
        sm: 'w-8 h-8 text-xs',
        md: 'w-10 h-10 text-sm',
        lg: 'w-12 h-12 text-base'
    };

    return (
        <div
            className={`
                ${sizeClasses[size]} 
                rounded-full 
                ${bgColor} 
                text-white 
                font-bold 
                flex items-center justify-center 
                uppercase 
                tracking-wider
                shadow-sm
                ring-2 ring-white
                shrink-0
                aspect-square
                ${className}
            `}
        >
            {initials}
        </div>
    );
};
