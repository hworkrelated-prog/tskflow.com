import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import ManagerCharacter from './ManagerCharacter';

const STORAGE_PREFIX = 'tskflow_tip_dismissed_';

/**
 * Soft, dismissible guidance — keeps UX clear without clutter.
 * tipId: unique key so dismissal persists per browser.
 */
const GuidanceTip = ({ tipId, title, body, actionLabel, onAction, className = '' }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            if (localStorage.getItem(STORAGE_PREFIX + tipId)) return;
            setVisible(true);
        } catch {
            setVisible(true);
        }
    }, [tipId]);

    const dismiss = () => {
        try {
            localStorage.setItem(STORAGE_PREFIX + tipId, '1');
        } catch { /* ignore */ }
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div
            className={`flex items-start gap-3 rounded-2xl border border-teal-200/70 bg-gradient-to-r from-teal-50/90 to-slate-50 px-4 py-3 shadow-soft ${className}`}
            data-testid={`guidance-tip-${tipId}`}
            role="status"
        >
            <ManagerCharacter mood="idle" size={48} className="shrink-0" />
            <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {title}
                </p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{body}</p>
                <div className="flex items-center gap-3 mt-2">
                    {actionLabel && onAction && (
                        <button
                            type="button"
                            onClick={() => { onAction(); dismiss(); }}
                            className="text-xs font-semibold text-teal-800 hover:text-teal-950 underline-offset-2 hover:underline"
                        >
                            {actionLabel}
                        </button>
                    )}
                    <button type="button" onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-700">
                        Got it
                    </button>
                </div>
            </div>
            <button type="button" onClick={dismiss} className="text-slate-400 hover:text-slate-600 p-0.5" aria-label="Dismiss tip">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

export default GuidanceTip;
