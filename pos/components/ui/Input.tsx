import React, { forwardRef } from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>, 'size'> {
    label?: React.ReactNode;
    error?: React.ReactNode;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
    inputClassName?: string;
    multiline?: boolean;
    rows?: number;
    required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({
        className = '',
        label,
        error,
        leftIcon,
        rightIcon,
        fullWidth = true,
        inputClassName = '',
        multiline = false,
        rows = 3,
        id,
        required,
        ...props
    }, ref) => {
        const generatedId = React.useId();
        const inputId = id || generatedId;
        const errorId = `${inputId}-error`;

        const baseInputStyles = "flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-text-main ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all";
        const errorStyles = error ? "border-danger focus-visible:ring-danger" : "";
        const iconLeftStyles = leftIcon ? "pl-10" : "";
        const iconRightStyles = rightIcon ? "pr-10" : "";

        return (
            <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''} ${className}`}>
                {label && (
                    <label htmlFor={inputId} className="text-sm font-medium text-text-main">
                        {label}
                        {required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                )}
                <div className="relative">
                    {leftIcon && (
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 z-10">
                            {leftIcon}
                        </div>
                    )}
                    {multiline ? (
                        <textarea
                            id={inputId}
                            ref={ref as any}
                            rows={rows}
                            className={`${baseInputStyles} h-auto ${errorStyles} ${iconLeftStyles} ${iconRightStyles} ${inputClassName}`}
                            aria-invalid={error ? 'true' : 'false'}
                            aria-describedby={error ? errorId : undefined}
                            {...(props as any)}
                        />
                    ) : (
                        <input
                            id={inputId}
                            ref={ref}
                            className={`${baseInputStyles} ${errorStyles} ${iconLeftStyles} ${iconRightStyles} ${inputClassName}`}
                            aria-invalid={error ? 'true' : 'false'}
                            aria-describedby={error ? errorId : undefined}
                            required={required}
                            aria-required={required}
                            {...props}
                        />
                    )}
                    {rightIcon && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 z-10">
                            {rightIcon}
                        </div>
                    )}
                </div>
                {error && (
                    <span id={errorId} className="text-xs text-danger" role="alert">{error}</span>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
