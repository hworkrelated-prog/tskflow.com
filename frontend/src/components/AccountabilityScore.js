import React from 'react';

const toneFor = (score) => {
    if (score == null) return 'bg-slate-100 text-slate-600';
    if (score >= 85) return 'bg-emerald-100 text-emerald-800';
    if (score >= 70) return 'bg-teal-100 text-teal-800';
    if (score >= 50) return 'bg-amber-100 text-amber-800';
    return 'bg-rose-100 text-rose-800';
};

/**
 * Compact 0–100 accountability chip. Score is how well someone responds,
 * finishes, and does not leave work sitting.
 */
export default function AccountabilityScore({
    score,
    label,
    size = 'md',
    className = '',
    testId = 'accountability-score',
}) {
    const text = score == null ? '—' : String(score);
    const title = label
        ? `${label}. Based on responding, finishing, and not leaving work sitting.`
        : 'Accountability score from how they respond, finish, and follow through.';
    const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad} ${toneFor(score)} ${className}`}
            title={title}
            data-testid={testId}
        >
            <span className="tabular-nums">{text}</span>
            {label ? <span className="font-medium opacity-80">{label}</span> : null}
        </span>
    );
}
