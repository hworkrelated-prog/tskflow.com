import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/App';
import { Button } from '@/components/ui/button';
import { shouldConnectCalendarOnSignup, startGoogleCalendarConnect } from '@/lib/googleCalendar';

/**
 * Teams signup step: start Google Calendar OAuth automatically.
 * Google still shows consent; we prefill the account with login_hint.
 */
const ConnectCalendarPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(true);
    const skipRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!user) return;
            if (!shouldConnectCalendarOnSignup(user)) {
                navigate('/dashboard', { replace: true });
                return;
            }
            try {
                const result = await startGoogleCalendarConnect({ next: '/dashboard' });
                if (cancelled || skipRef.current) return;
                if (result?.already_connected) {
                    navigate('/dashboard', { replace: true });
                }
            } catch (_) {
                if (cancelled || skipRef.current) return;
                setError('Could not start Google Calendar connection. Try again, or skip for now.');
                setBusy(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [user, navigate]);

    const handleSkip = () => {
        skipRef.current = true;
        navigate('/dashboard', { replace: true });
    };

    const handleRetry = async () => {
        setError('');
        setBusy(true);
        try {
            const result = await startGoogleCalendarConnect({ next: '/dashboard' });
            if (skipRef.current) return;
            if (result?.already_connected) {
                navigate('/dashboard', { replace: true });
            }
        } catch (_) {
            if (skipRef.current) return;
            setError('Could not start Google Calendar connection. Try again, or skip for now.');
            setBusy(false);
        }
    };

    return (
        <div
            className="flex flex-col items-center justify-center min-h-screen gradient-mesh app-boot-splash gap-4 px-6 text-center"
            data-testid="connect-calendar-page"
        >
            <div className="w-10 h-10 rounded-xl bg-teal-500/90 flex items-center justify-center text-white font-bold text-sm">TF</div>
            <div className="text-lg font-medium text-foreground">
                {error || (busy ? 'Connecting Google Calendar…' : 'Connect Google Calendar')}
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
                Teams tasks you accept are added to your calendar automatically.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
                {error ? (
                    <Button
                        type="button"
                        onClick={handleRetry}
                        className="rounded-full"
                        data-testid="connect-calendar-retry"
                    >
                        Try again
                    </Button>
                ) : null}
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkip}
                    className="rounded-full"
                    data-testid="connect-calendar-skip"
                >
                    Skip for now
                </Button>
            </div>
        </div>
    );
};

export default ConnectCalendarPage;
