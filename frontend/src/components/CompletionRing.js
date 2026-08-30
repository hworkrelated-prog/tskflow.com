import React from 'react';

/** Compact average completion mark used on group tasks and the landing story. */
export default function CompletionRing({
    pct = 0,
    size = 48,
    testId = 'group-avg-completion',
}) {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    const r = 15.5;
    const c = 2 * Math.PI * r;
    const dash = (clamped / 100) * c;
    return (
        <div
            className="completion-ring"
            data-testid={testId}
            aria-label={`${clamped} percent complete`}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
                <circle cx="20" cy="20" r={r} className="completion-ring-track" />
                <circle
                    cx="20"
                    cy="20"
                    r={r}
                    className="completion-ring-value"
                    strokeDasharray={`${dash} ${c}`}
                    transform="rotate(-90 20 20)"
                />
            </svg>
            <span className="completion-ring-pct">{clamped}%</span>
        </div>
    );
}
