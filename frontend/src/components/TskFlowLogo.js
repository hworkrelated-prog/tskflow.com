import React from 'react';

/** Flat T tile — used in the film as the product, not as the brand lockup. */
export function TskFlowMark({ size = 28, className = '' }) {
    return (
        <svg
            className={`tskflow-logo-mark ${className}`.trim()}
            width={size}
            height={size}
            viewBox="0 0 32 32"
            aria-hidden
            focusable="false"
        >
            <rect width="32" height="32" rx="8" fill="#0f766e" />
            <path fill="#fff" d="M8 8.4h16v3.2h-6.2V23.6h-3.6V11.6H8z" />
        </svg>
    );
}

const SIZES = {
    sm: 22,
    md: 30,
    lg: 38,
};

/**
 * Brand lockup is the word TskFlow. The mark is optional (film stills, favicon).
 */
export default function TskFlowLogo({
    variant = 'light',
    size = 'md',
    withWord = true,
    withMark = false,
    className = '',
    testId,
}) {
    const markSize = SIZES[size] || SIZES.md;

    return (
        <span
            className={`tskflow-logo tskflow-logo--${size} tskflow-logo--${variant}${className ? ` ${className}` : ''}`}
            data-testid={testId}
        >
            {withMark ? <TskFlowMark size={markSize} /> : null}
            {withWord ? (
                <span className="tskflow-logo-word">TskFlow</span>
            ) : (
                <span className="sr-only">TskFlow</span>
            )}
        </span>
    );
}
