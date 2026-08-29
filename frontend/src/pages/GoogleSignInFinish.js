import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth, API } from '@/App';
import { clearGuestSession } from '@/lib/guestSession';

/**
 * Landing spot after the Google sign-in redirect: swap the token for the user,
 * then drop them where they were heading (dashboard, or their robot room).
 */
const GoogleSignInFinish = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const [message, setMessage] = useState('Signing you in…');

    useEffect(() => {
        const token = searchParams.get('token');
        const next = searchParams.get('next') || '/dashboard';
        if (!token) {
            setMessage('That sign-in link expired. Try again from the sign-in page.');
            navigate('/login?error=google_signin_failed', { replace: true });
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { data } = await axios.get(`${API}/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (cancelled) return;
                login(token, data);
                clearGuestSession();
                toast.success('Signed in with Google');
                navigate(next, { replace: true });
            } catch {
                if (cancelled) return;
                setMessage('Google sign-in could not finish. Try again from the sign-in page.');
                navigate('/login?error=google_signin_failed', { replace: true });
            }
        })();
        return () => { cancelled = true; };
    }, [searchParams, navigate, login]);

    return (
        <div
            className="flex flex-col items-center justify-center min-h-screen gradient-mesh app-boot-splash gap-3 px-6 text-center"
            data-testid="google-signin-finish"
        >
            <div className="w-10 h-10 rounded-xl bg-teal-500/90 flex items-center justify-center text-white font-bold text-sm">TF</div>
            <div className="text-lg font-medium text-foreground">{message}</div>
        </div>
    );
};

export default GoogleSignInFinish;
