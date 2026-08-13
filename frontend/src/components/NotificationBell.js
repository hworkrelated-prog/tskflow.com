import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react';
import { API } from '@/App';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export const NotificationBell = () => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const wrapperRef = useRef(null);
    const navigate = useNavigate();

    const fetchAll = async () => {
        try {
            const res = await axios.get(`${API}/notifications`);
            setItems(res.data.notifications || []);
            setUnread(res.data.unread || 0);
        } catch (_) { /* silent */ }
    };

    useEffect(() => {
        fetchAll();
        let t = null;
        const start = () => {
            if (t) return;
            t = setInterval(() => {
                if (document.visibilityState === 'visible') fetchAll();
            }, 45000);
        };
        const stop = () => { if (t) { clearInterval(t); t = null; } };
        const onVis = () => {
            if (document.visibilityState === 'visible') { fetchAll(); start(); }
            else stop();
        };
        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('tskflow:app-wake', fetchAll);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('tskflow:app-wake', fetchAll);
        };
    }, []);

    // Listen for WS-driven notification events dispatched from App.js
    useEffect(() => {
        const handler = () => fetchAll();
        window.addEventListener('tskflow:notification', handler);
        return () => window.removeEventListener('tskflow:notification', handler);
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const onClick = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const markOne = async (id) => {
        try {
            await axios.post(`${API}/notifications/${id}/read`);
            fetchAll();
        } catch (_) { /* silent */ }
    };

    const markAll = async () => {
        try {
            await axios.post(`${API}/notifications/mark-all-read`);
            fetchAll();
        } catch (_) { /* silent */ }
    };

    const openNotif = (n) => {
        if (!n.read) markOne(n.id);
        if (n.type === 'team_claim' || n.claim_id) {
            navigate('/team?claims=1');
            setOpen(false);
            return;
        }
        if (n.task_id) navigate(`/task/${n.task_id}`);
        setOpen(false);
    };

    const respondClaim = async (e, n, action) => {
        e.stopPropagation();
        const claimId = n.claim_id || n.meta?.claim_id;
        if (!claimId) {
            navigate('/team?claims=1');
            setOpen(false);
            return;
        }
        try {
            await axios.post(`${API}/team/claims/${claimId}/respond`, { action });
            markOne(n.id);
            fetchAll();
            window.dispatchEvent(new CustomEvent('tskflow:notification'));
        } catch (_) {
            navigate('/team?claims=1');
            setOpen(false);
        }
    };

    return (
        <div ref={wrapperRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
                aria-label="Notifications"
                data-testid="notification-bell"
            >
                <Bell className="w-5 h-5 text-gray-700" />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>
            {open && (
                <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-[calc(3.75rem+env(safe-area-inset-top,0px))] sm:top-12 w-auto sm:w-96 max-w-none sm:max-w-[92vw] bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-[min(70dvh,28rem)] flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                        <h3 className="font-semibold">Notifications</h3>
                        {unread > 0 && (
                            <button onClick={markAll} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(false);
                            window.dispatchEvent(new CustomEvent('tskflow:open-catch-up'));
                        }}
                        className="w-full px-4 py-2.5 text-left border-b bg-rose-50/60 hover:bg-rose-50 text-sm text-rose-900 flex items-center gap-2"
                        data-testid="catch-up-link"
                    >
                        <Inbox className="w-4 h-4 text-rose-600" />
                        <span className="font-medium">Catch up on what&apos;s due</span>
                        <span className="ml-auto text-xs text-rose-500">Review →</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setOpen(false); navigate('/updates'); }}
                        className="w-full px-4 py-2.5 text-left border-b bg-teal-50/50 hover:bg-teal-50 text-sm text-teal-800 flex items-center gap-2"
                        data-testid="whats-new-link"
                    >
                        <span className="text-base">✨</span>
                        <span className="font-medium">What&apos;s new in Tskflow</span>
                        <span className="ml-auto text-xs text-teal-500">See changelog →</span>
                    </button>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                        {items.length === 0 ? (
                            <div className="px-6 py-10 text-center text-sm text-gray-500">You&apos;re all caught up.</div>
                        ) : items.map((n) => (
                            <div
                                key={n.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => openNotif(n)}
                                onKeyDown={(e) => { if (e.key === 'Enter') openNotif(n); }}
                                className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-gray-50 flex items-start gap-3 cursor-pointer ${n.read ? 'bg-white' : 'bg-teal-50/40'}`}
                            >
                                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-teal-500'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">{n.title}</div>
                                    <div className="text-xs text-gray-600 line-clamp-2">{n.body}</div>
                                    {n.type === 'team_claim' && (n.claim_id || n.meta?.claim_id) && (
                                        <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="text-[11px] font-semibold px-2 py-1 rounded-full bg-teal-700 text-white"
                                                onClick={(e) => respondClaim(e, n, 'accept')}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                type="button"
                                                className="text-[11px] font-semibold px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700"
                                                onClick={(e) => respondClaim(e, n, 'ignore')}
                                            >
                                                Ignore
                                            </button>
                                            <button
                                                type="button"
                                                className="text-[11px] font-semibold px-2 py-1 rounded-full text-rose-700 hover:bg-rose-50"
                                                onClick={(e) => respondClaim(e, n, 'dispute')}
                                            >
                                                Dispute
                                            </button>
                                        </div>
                                    )}
                                    <div className="text-[10px] text-gray-400 mt-1">
                                        {n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ''}
                                    </div>
                                </div>
                                {!n.read && (
                                    <span className="text-[10px] text-teal-600 flex items-center gap-1 shrink-0">
                                        <Check className="w-3 h-3" />
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
