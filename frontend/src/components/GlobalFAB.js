import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '@/App';

/**
 * Focuses the persistent AI dock. Navigates to the hub when needed so the
 * create flow is always one tap away.
 */
const GlobalFAB = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    if (!user) return null;
    const hiddenPaths = ['/login', '/register', '/verify-email', '/forgot-password', '/', '/privacy', '/terms', '/contact'];
    if (hiddenPaths.includes(location.pathname)) return null;
    if (location.pathname.startsWith('/recording/controls')) return null;

    const onClick = () => {
        window.dispatchEvent(new CustomEvent('tskflow:open-ai-create'));
        if (location.pathname !== '/dashboard') {
            navigate('/dashboard?create=1');
        }
        // Nudge the dock into view / pulse the composer
        setTimeout(() => {
            const dock = document.querySelector('[data-testid="ai-command-dock"]');
            dock?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
            dock?.classList?.add('ai-dock-pulse');
            setTimeout(() => dock?.classList?.remove('ai-dock-pulse'), 900);
            window.dispatchEvent(new CustomEvent('tskflow:focus-ai-prompt'));
        }, 80);
    };

    return (
        <button
            type="button"
            data-testid="global-fab-new-task"
            aria-label="Create a new task"
            onClick={onClick}
            className="fixed safe-fab-bl z-40 h-12 w-12 sm:h-auto sm:w-auto sm:pl-3.5 sm:pr-4 sm:py-2.5 rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 hover:bg-slate-800 hover:scale-[1.03] active:scale-[0.98] transition-transform border border-white/10"
            title="Create a task"
        >
            <Plus className="w-5 h-5 sm:w-4 sm:h-4" strokeWidth={2.25} />
            <span className="font-semibold text-sm hidden sm:inline tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                New Task
            </span>
        </button>
    );
};

export default GlobalFAB;
