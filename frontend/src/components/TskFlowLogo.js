import React, { useId } from 'react';

/** Check that becomes a current — the TskFlow mark. */
export function TskFlowMark({ size = 28, className = '' }) {
    const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
    const g = `tf-mark-${raw}`;
    const s = `tf-shine-${raw}`;

    return (
        <svg
            className={`tskflow-logo-mark ${className}`.trim()}
            width={size}
            height={size}
            viewBox="0 0 32 32"
            aria-hidden
            focusable="false"
        >
            <defs>
                <linearGradient id={g} x1="3" y1="1" x2="30" y2="31" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#5eead4" />
                    <stop offset="0.48" stopColor="#2dd4bf" />
                    <stop offset="1" stopColor="#0f766e" />
                </linearGradient>
                <linearGradient id={s} x1="16" y1="0" x2="16" y2="18" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fff" stopOpacity="0.3" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill={`url(#${g})`} />
            <rect width="32" height="32" rx="9" fill={`url(#${s})`} />
            <path
                fill="none"
                stroke="#fff"
                strokeWidth="2.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 16.7 13.2 22 19.1 13.6c2.4-3.4 6.2 0.2 9.4-3.4"
            />
        </svg>
    );
}

const SIZES = {
    sm: 22,
    md: 30,
    lg: 38,
};

/**
 * Brand lockup: mark + TskFlow. Dark for the landing, light for app chrome.
 */
export default function TskFlowLogo({
    variant = 'light',
    size = 'md',
    withWord = true,
    className = '',
    testId,
}) {
    const markSize = SIZES[size] || SIZES.md;

    return (
        <span
            className={`tskflow-logo tskflow-logo--${size} tskflow-logo--${variant}${className ? ` ${className}` : ''}`}
            data-testid={testId}
        >
            <TskFlowMark size={markSize} />
            {withWord ? (
                <span className="tskflow-logo-word">
                    <span className="tskflow-logo-tsk">Tsk</span>
                    <span className="tskflow-logo-flow">Flow</span>
                </span>
            ) : (
                <span className="sr-only">TskFlow</span>
            )}
        </span>
    );
}
