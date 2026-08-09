import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '@/App';

// Global floating "New Task" button visible on every authenticated page.
// Bottom-LEFT. Opens the AI create dialog (not the advanced form).
// TaskHub listens for 'tskflow:open-ai-create'; other pages navigate to /dashboard?create=1.
const GlobalFAB = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    if (!user) return null;
    const hiddenPaths = ['/login', '/register', '/verify-email', '/forgot-password'];
    if (hiddenPaths.includes(location.pathname)) return null;

    const onClick = () => {
        window.dispatchEvent(new CustomEvent('tskflow:open-ai-create'));
        if (location.pathname !== '/dashboard') {
            navigate('/dashboard?create=1');
        }
    };

    return (
        <button
            type="button"
            data-testid="global-fab-new-task"
            aria-label="Tell TskFlow what you need done"
            onClick={onClick}
            className="fixed bottom-6 left-6 z-40 h-14 pl-4 pr-5 rounded-full bg-slate-900 text-white shadow-xl shadow-slate-900/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
            title="Tell TskFlow what you need done"
        >
            <Plus className="w-5 h-5" />
            <span className="font-semibold text-sm hidden sm:inline">New Task</span>
        </button>
    );
};

export default GlobalFAB;
