import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Mail, MessageSquare, Clock, Bell, Check, ArrowRight, Bot } from 'lucide-react';
import { useAuth, API } from '@/App';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { guestTaskId, rememberGuestSession } from '@/lib/guestSession';
import { trackEnvView } from '@/lib/productAnalytics';
import { pinDocumentTheme, restoreDocumentTheme } from '@/lib/theme';

const CHANNEL_ICON = {
    email: Mail,
    slack: MessageSquare,
    in_app: Bell,
};

const shortTime = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
        return '';
    }
};

const dueLabel = (raw) => {
    if (!raw) return 'no time set';
    try {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return raw;
        return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    } catch {
        return raw;
    }
};

/**
 * Guest follow-up after a landing send: one task, one assignee, and what happened.
 * Deliberately not the full dashboard - this is the first thing a visitor ever sees.
 */
const RobotRoomPage = () => {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [connectingSlack, setConnectingSlack] = useState(false);

    const isGuest = Boolean(room?.is_guest ?? user?.is_guest);

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/demo/room/${taskId}`);
            setRoom(data);
        } catch (error) {
            if (error?.response?.status === 404) toast.error('That room is gone. Send a new ask.');
            else if (error?.response?.status === 403) navigate('/dashboard', { replace: true });
        } finally {
            setLoading(false);
        }
    }, [taskId, navigate]);

    useEffect(() => {
        pinDocumentTheme('dark');
        document.body.classList.add('landing-active');
        return () => {
            document.body.classList.remove('landing-active');
            restoreDocumentTheme();
        };
    }, []);

    useEffect(() => {
        load();
        trackEnvView({ surface: 'env' });
        if (taskId && user?.is_guest) rememberGuestSession(user.id, taskId);
        const poll = setInterval(load, 30000);
        return () => clearInterval(poll);
    }, [load, taskId, user]);

    const connectSlack = async () => {
        setConnectingSlack(true);
        try {
            const { data } = await axios.get(`${API}/integrations/slack/connect`);
            if (data?.auth_url) window.location.href = data.auth_url;
        } catch (error) {
            const detail = error?.response?.data?.detail;
            toast.info(
                typeof detail === 'string'
                    ? detail
                    : 'Keep this workspace first, then connect Slack from Settings.',
            );
        } finally {
            setConnectingSlack(false);
        }
    };

    const keepWorkspace = () => {
        const params = new URLSearchParams({ from: 'env' });
        if (user?.id && user?.is_guest) params.set('guest', user.id);
        else if (guestTaskId()) params.set('task', guestTaskId());
        navigate(`/register?${params.toString()}`);
    };

    if (loading) {
        return (
            <div className="landing-page min-h-screen text-white flex items-center justify-center" style={{ background: '#050807' }}>
                <div className="text-white/70" data-testid="env-loading">Opening the room…</div>
            </div>
        );
    }

    const task = room?.task || {};
    const activity = room?.activity || [];
    const copy = room?.copy || {};
    const channel = room?.channel || 'email';

    return (
        <div className="landing-page min-h-screen text-white" style={{ background: '#050807' }} data-testid="env-page">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-40 right-[-20%] w-[620px] h-[620px] rounded-full bg-teal-500/15 blur-[120px]" />
            </div>

            <nav className="relative z-10 max-w-4xl mx-auto px-5 h-16 flex items-center justify-between">
                <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>TskFlow</span>
                <div className="flex items-center gap-2">
                    {isGuest ? (
                        <>
                            <GoogleSignInButton
                                label="Keep this with Google"
                                next={`/env/${taskId}`}
                                className="border-white/20 bg-transparent text-white hover:bg-white/10 h-10"
                                testId="env-google-signin"
                            />
                            <Button
                                className="rounded-full bg-white text-slate-950 hover:bg-teal-100 h-10"
                                onClick={keepWorkspace}
                                data-testid="env-keep-workspace"
                            >
                                Keep this workspace
                            </Button>
                        </>
                    ) : (
                        <Button
                            className="rounded-full bg-white text-slate-950 hover:bg-teal-100 h-10"
                            onClick={() => navigate('/dashboard')}
                            data-testid="env-open-dashboard"
                        >
                            Open dashboard <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </nav>

            <main className="relative z-10 max-w-4xl mx-auto px-5 pb-20">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
                    <p className="text-teal-300/90 text-xs uppercase tracking-[0.2em] mb-3">Your task</p>
                    <h1 className="text-3xl sm:text-4xl font-semibold leading-tight mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        {copy.headline || 'Your ask is on its way'}
                    </h1>
                    <p className="text-white/60 leading-relaxed max-w-2xl mb-8" data-testid="env-subcopy">
                        {copy.sub} {copy.reassurance}
                    </p>
                </motion.div>

                <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
                    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/12 p-5" data-testid="env-ask">
                        <p className="text-[11px] uppercase tracking-wide text-white/40 mb-2">What you asked</p>
                        <p className="text-xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{task.title}</p>
                        {task.description && task.description !== task.title && (
                            <p className="text-white/55 leading-relaxed text-sm">{task.description}</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-teal-400/15 text-teal-100 px-2.5 py-1" data-testid="env-assignee">
                                {task.assigned_to_name || task.assigned_to_email}
                            </span>
                            <span className="rounded-full bg-white/[0.07] text-white/70 px-2.5 py-1 inline-flex items-center gap-1.5" data-testid="env-channel">
                                {channel === 'slack' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                                {channel === 'slack' ? 'Slack follow-up requested' : 'Email'}
                            </span>
                            <span className="rounded-full bg-white/[0.07] text-white/70 px-2.5 py-1 inline-flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> Due {dueLabel(task.due_date)}
                            </span>
                            <span className="rounded-full bg-white/[0.07] text-white/70 px-2.5 py-1">{task.status}</span>
                        </div>
                        {!room?.delivered && (
                            <p className="mt-4 text-xs text-amber-200/80" data-testid="env-sample-note">
                                Sample send - nothing left the building. Add a real email next time and it goes out.
                            </p>
                        )}
                    </div>

                    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/12 p-5">
                        <p className="text-[11px] uppercase tracking-wide text-white/40 mb-3">Keep this going</p>
                        <div className="space-y-2.5">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={connectSlack}
                                disabled={connectingSlack}
                                className="w-full justify-start rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 h-11"
                                data-testid="env-connect-slack"
                            >
                                <MessageSquare className="w-4 h-4 mr-2" />
                                {connectingSlack ? 'Opening Slack…' : 'Connect Slack for silent assignees'}
                            </Button>
                            <GoogleSignInButton
                                label="Continue with Google"
                                next={`/env/${taskId}`}
                                className="w-full justify-start border-white/20 bg-transparent text-white hover:bg-white/10 h-11"
                                testId="env-google-continue"
                            />
                            {isGuest && (
                                <Button
                                    type="button"
                                    onClick={keepWorkspace}
                                    className="w-full justify-start rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 h-11"
                                    data-testid="env-keep-workspace-panel"
                                >
                                    <Check className="w-4 h-4 mr-2" /> Keep this workspace
                                </Button>
                            )}
                        </div>
                        <p className="mt-4 text-xs text-white/40 leading-relaxed">
                            TskFlow follows up so you never write &ldquo;just circling back&rdquo; again. Nothing here
                            disappears when you keep the workspace.
                        </p>
                    </div>
                </div>

                <div className="mt-6 rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/12 p-5" data-testid="env-activity">
                    <p className="text-[11px] uppercase tracking-wide text-white/40 mb-4">What&apos;s happening</p>
                    <ol className="space-y-4">
                        {activity.map((row) => {
                            const Icon = CHANNEL_ICON[row.channel] || Bot;
                            return (
                                <li key={row.id} className="flex gap-3">
                                    <span className="mt-0.5 w-8 h-8 shrink-0 rounded-full bg-teal-400/15 ring-1 ring-teal-300/20 inline-flex items-center justify-center">
                                        <Icon className="w-4 h-4 text-teal-200" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-white/90">
                                            {row.title}
                                            <span className="ml-2 text-[11px] text-white/35">{shortTime(row.created_at)}</span>
                                        </p>
                                        <p className="text-sm text-white/55 leading-relaxed">{row.body}</p>
                                    </div>
                                </li>
                            );
                        })}
                        {!activity.length && (
                            <li className="text-sm text-white/45">Updates will show here in a moment.</li>
                        )}
                    </ol>
                </div>
            </main>
        </div>
    );
};

export default RobotRoomPage;
