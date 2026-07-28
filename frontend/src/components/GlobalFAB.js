import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '@/App';

// Global floating "New Task" button visible on every authenticated page.
// Bottom-LEFT (per spec). Clicking dispatches a 'tskflow:open-create-task' custom
// event so pages that already own a Create Task modal (like TaskHub) can open it in
// place; on other pages we navigate to /dashboard?create=1 which TaskHub picks up.
const GlobalFAB = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    if (!user) return null;
    // Hide on landing / auth / help walkthrough overlays if needed
    const hiddenPaths = ['/login', '/register', '/verify-email', '/forgot-password'];
    if (hiddenPaths.includes(location.pathname)) return null;

    const onClick = () => {
        // Broadcast — if TaskHub is mounted it will open its modal directly.
        window.dispatchEvent(new CustomEvent('tskflow:open-create-task'));
        // If we're not on the dashboard, take the user there with a query flag
        if (location.pathname !== '/dashboard') {
            navigate('/dashboard?create=1');
        }
    };

    return (
        <button
            type="button"
            data-testid="global-fab-new-task"
            aria-label="Create new task"
            onClick={onClick}
            className="fixed bottom-6 left-6 z-40 h-14 pl-4 pr-5 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-500/30 flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
            title="Create a new task from anywhere"
        >
            <Plus className="w-5 h-5" />
            <span className="font-semibold text-sm hidden sm:inline">New Task</span>
        </button>
    );
};

export default GlobalFAB;
