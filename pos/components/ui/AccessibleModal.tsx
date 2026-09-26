import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useFocusRestore } from '../../hooks/useFocusRestore';
import Portal from '../shared/Portal';
import { Z_INDEX } from '../../constants/zIndex';
import clsx from 'clsx';

export interface AccessibleModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    headerIcon?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    /**
     * Fully REPLACES the default overlay classes. Use this when migrating a
     * hand-rolled `fixed inset-0` dialog so the visual output is preserved
     * exactly (backdrop color/blur, animation duration, alignment...).
     */
    overlayClassName?: string;
    /**
     * Fully REPLACES the default panel (card) classes. Use this when migrating
     * a hand-rolled dialog card so the visual output is preserved exactly.
     * When omitted, `className` is appended additively to the default panel.
     */
    panelClassName?: string;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
    /** Convenience size variant (sm/md/lg/xl). Overrides `maxWidth` when set. */
    size?: 'sm' | 'md' | 'lg' | 'xl';
    hideCloseButton?: boolean;
    showSeparator?: boolean;
    footer?: React.ReactNode;
    /** Hide the built-in header chrome entirely and render children raw. */
    hideHeader?: boolean;
    /** Replaces the default body wrapper classes (flex-1 overflow-y-auto p-6). */
    bodyClassName?: string;
    /** Set false for dialogs where closing on backdrop click is unsafe. */
    closeOnOverlayClick?: boolean;
    /** Set false for dialogs where closing via Escape is unsafe (e.g. payments). */
    escapeCloses?: boolean;
    /** Accessible name used when there is no visible title element. */
    ariaLabel?: string;
    /** Id of an element inside children to use as the accessible name (aria-labelledby). */
    ariaLabelledBy?: string;
    /** Optional inline style for the overlay (e.g. z-index stacking overrides). */
    overlayStyle?: React.CSSProperties;
    /** Optional inline style for the panel (e.g. maxHeight overrides). */
    panelStyle?: React.CSSProperties;
}

/**
 * A reusable modal component that follows WCAG 2.1 AA accessibility guidelines.
 * Includes focus trapping, scroll locking, and focus restoration.
 */
export const AccessibleModal: React.FC<AccessibleModalProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    headerIcon,
    children,
    className = '',
    overlayClassName,
    panelClassName,
    maxWidth = 'md',
    size,
    hideCloseButton = false,
    showSeparator = true,
    footer,
    hideHeader = false,
    bodyClassName,
    closeOnOverlayClick = true,
    escapeCloses = true,
    ariaLabel,
    ariaLabelledBy,
    overlayStyle,
    panelStyle
}) => {
    // Accessibility hooks
    useScrollLock(isOpen);
    const focusTrapRef = useFocusTrap(isOpen);
    useFocusRestore(isOpen);

    // Handle Escape key
    useEffect(() => {
        if (!isOpen || !escapeCloses) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose, escapeCloses]);

    const modalId = React.useId();
    const titleId = `modal-title-${modalId}`;

    if (!isOpen) return null;

    const maxWidthClasses: Record<string, string> = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
        full: 'max-w-[95vw]'
    };

    const resolvedMaxWidth = size ?? maxWidth;

    const overlayClasses = overlayClassName ??
        "fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200";

    const panelClasses = panelClassName ?? clsx(
        "bg-white rounded-3xl shadow-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]",
        maxWidthClasses[resolvedMaxWidth],
        className
    );

    const bodyClasses = bodyClassName ?? "flex-1 overflow-y-auto custom-scrollbar p-6";

    const hasHeader = !hideHeader && Boolean(title || subtitle || headerIcon);

    const labelledBy = ariaLabelledBy ?? (title ? titleId : undefined);
    const accessibleName = labelledBy ? undefined : (ariaLabel ?? (typeof title === 'string' ? title : undefined));

    return (
        <Portal>
            <div
                style={overlayStyle ?? { zIndex: Z_INDEX.MODAL_CONTENT }}
                className={overlayClasses}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                aria-label={accessibleName}
                onClick={closeOnOverlayClick ? onClose : undefined}
            >
                <div
                    ref={focusTrapRef as React.RefObject<HTMLDivElement>}
                    style={panelStyle}
                    className={panelClasses}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    {hasHeader && (
                        <div className={clsx(
                            "p-6 flex items-center justify-between shrink-0",
                            showSeparator && "border-b border-slate-100 bg-slate-50/30"
                        )}>
                            <div className="flex items-center gap-4">
                                {headerIcon && (
                                    <div className="shrink-0">
                                        {headerIcon}
                                    </div>
                                )}
                                <div>
                                    <h2 id={titleId} className="text-xl font-bold text-slate-900 uppercase tracking-tight">
                                        {title}
                                    </h2>
                                    {subtitle && (
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                            {subtitle}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {!hideCloseButton && (
                                <button
                                    onClick={onClose}
                                    aria-label="Close modal"
                                    className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all active:scale-90"
                                >
                                    <X size={20} strokeWidth={2.5} aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Content */}
                    <div className={bodyClasses}>
                        {children}
                    </div>

                    {/* Footer */}
                    {footer && (
                        <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0">
                            {footer}
                        </div>
                    )}
                </div>
            </div>
        </Portal>
    );
};
