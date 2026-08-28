import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { googleCallbackBackendUrl } from '@/lib/googleOAuthHandoff';
import { peekCalendarOAuthNext } from '@/lib/googleCalendar';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Shown when Google returns to tskflow.com/api/auth/google/callback.
 * Forwards code+state to the real API host, which then redirects to the
 * in-app page stored on the OAuth state (dashboard after Teams signup, Settings otherwise).
 */
const GoogleOAuthHandoff = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [message, setMessage] = useState('Connecting Google…');

    useEffect(() => {
        const failTo = `${peekCalendarOAuthNext('/settings')}?error=oauth_denied`;
        const params = new URLSearchParams(location.search);
        if (params.get('error')) {
            navigate(failTo, { replace: true });
            return;
        }
        if (!params.get('code')) {
            setMessage('Calendar connection did not finish. You can try again from Settings.');
            return;
        }
        const next = googleCallbackBackendUrl({
            backendUrl: BACKEND_URL,
            pathname: location.pathname,
            search: location.search,
            origin: window.location.origin,
        });
        if (!next) {
            setMessage('Calendar connection could not finish. Return to Settings and try again.');
            return;
        }
        window.location.replace(next);
    }, [location.pathname, location.search, navigate]);

    return (
        <div
            className="flex flex-col items-center justify-center min-h-screen gradient-mesh app-boot-splash gap-3 px-6 text-center"
            data-testid="google-oauth-handoff"
        >
            <div className="w-10 h-10 rounded-xl bg-teal-500/90 flex items-center justify-center text-white font-bold text-sm">TF</div>
            <div className="text-lg font-medium text-foreground">{message}</div>
        </div>
    );
};

export default GoogleOAuthHandoff;
