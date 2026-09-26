import React, { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning' | 'info';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({
        className = '',
        variant = 'primary',
        size = 'md',
        isLoading = false,
        leftIcon,
        rightIcon,
        children,
        disabled,
        ...props
    }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none';

        const variants = {
            primary: 'border-0 bg-primary hover:bg-primary-hover text-white shadow-sm hover:shadow',
            secondary: 'border-0 bg-secondary hover:bg-secondary-hover text-white shadow-sm hover:shadow',
            danger: 'border-0 bg-danger hover:bg-danger-hover text-white shadow-sm hover:shadow',
            success: 'border-0 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow',
            warning: 'border-0 bg-amber-500 hover:bg-amber-600 text-white shadow-sm hover:shadow',
            info: 'border-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow',
            outline: 'border border-gray-300 bg-transparent hover:bg-gray-50 text-text-main',
            ghost: 'border-0 bg-transparent hover:bg-gray-100 text-text-main',
        };

        const sizes = {
            sm: 'h-8 px-3 text-sm',
            md: 'h-10 px-4 text-sm',
            lg: 'h-12 px-6 text-base',
        };

        return (
            <button
                ref={ref}
                className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className} gap-2`}
                disabled={disabled || isLoading}
                aria-busy={isLoading}
                {...props}
            >
                {isLoading && (
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                )}
                {!isLoading && leftIcon && <span>{leftIcon}</span>}
                {children}
                {!isLoading && rightIcon && <span>{rightIcon}</span>}
            </button>
        );
    }
);

Button.displayName = 'Button';
