import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';

/**
 * Records that an invite link was opened, then sends the person to register.
 */
const JoinInvitePage = () => {
    const { token } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [message, setMessage] = useState('Opening your invite…');

    useEffect(() => {
        let cancelled = false;
        let timer;
        (async () => {
            const fallbackEmail = (searchParams.get('email') || '').trim();
            try {
                const res = await axios.get(`${API}/team/join/${encodeURIComponent(token || '')}`);
                if (cancelled) return;
                const email = res.data?.email || fallbackEmail;
                if (email) {
                    navigate(`/register?email=${encodeURIComponent(email)}`, { replace: true });
                    return;
                }
                navigate('/register', { replace: true });
            } catch (_) {
                if (cancelled) return;
                setMessage('This invite link is no longer valid. You can still create an account.');
                timer = setTimeout(() => {
                    const q = fallbackEmail ? `?email=${encodeURIComponent(fallbackEmail)}` : '';
                    navigate(`/register${q}`, { replace: true });
                }, 1600);
            }
        })();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [token, navigate, searchParams]);

    return (
        <div
            className="flex flex-col items-center justify-center min-h-screen gradient-mesh app-boot-splash gap-3 px-6 text-center"
            data-testid="join-invite-page"
        >
            <div className="w-10 h-10 rounded-xl bg-teal-500/90 flex items-center justify-center text-white font-bold text-sm">TF</div>
            <div className="text-lg font-medium text-foreground">{message}</div>
        </div>
    );
};

export default JoinInvitePage;
