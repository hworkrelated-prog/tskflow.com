import React from 'react';
import { Button } from '@/components/ui/button';
import { guestUserId } from '@/lib/guestSession';
import { sessionId } from '@/lib/productAnalytics';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const GoogleMark = () => (
    <svg className="w-4 h-4 mr-2" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.99 8.99 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
);

/**
 * Sign in with Google - identity only, separate from the Calendar/Sheets grants.
 * Carries the guest demo session so the robot room survives the upgrade.
 */
export const GoogleSignInButton = ({
    label = 'Continue with Google',
    next = '/dashboard',
    className = '',
    variant = 'outline',
    testId = 'google-signin-button',
    onBeforeRedirect,
}) => {
    const go = () => {
        onBeforeRedirect?.();
        const params = new URLSearchParams({ next: next || '/dashboard' });
        const guest = guestUserId();
        if (guest) params.set('guest_user_id', guest);
        const sid = sessionId();
        if (sid) params.set('session_id', sid);
        window.location.href = `${API}/auth/google/login?${params.toString()}`;
    };

    return (
        <Button
            type="button"
            variant={variant}
            onClick={go}
            data-testid={testId}
            className={`rounded-full ${className}`}
        >
            <GoogleMark />
            {label}
        </Button>
    );
};

export default GoogleSignInButton;
