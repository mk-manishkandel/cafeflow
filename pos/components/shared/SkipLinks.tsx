import React from 'react';

/**
 * Skip Links Component
 * Provides keyboard shortcuts to skip to main content areas
 * Improves navigation efficiency for screen reader and keyboard users
 */
export const SkipLinks: React.FC = () => {
    return (
        <div className="skip-links">
            <a href="#main-content" className="sr-only sr-only-focusable">
                Skip to main content
            </a>
            <a href="#pos-menu" className="sr-only sr-only-focusable">
                Skip to menu
            </a>
            <a href="#cart-sidebar" className="sr-only sr-only-focusable">
                Skip to cart
            </a>
        </div>
    );
};
