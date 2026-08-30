import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Mail, MessageSquare, Clock, Bell, Check, ArrowRight, Bot, Video, CheckCircle2 } from 'lucide-react';
import { useAuth, API } from '@/App';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { guestTaskId, rememberGuestSession } from '@/lib/guestSession';
import { trackEnvView } from '@/lib/productAnalytics';
import { pinDocumentTheme, restoreDocumentTheme } from '@/lib/theme';
import TskFlowLogo from '@/components/TskFlowLogo';

const CHANNEL_ICON = {
    email: Mail,
    slack: MessageSquare,
    in_app: Bell,
};

const beatLabel = (title) => {
    const t = String(title || '').toLowerCase();
    if (t.includes('walkthrough') || t.includes('video')) return 'Video';
    if (t.includes('queued')) return 'Queued';
    if (t.includes('deliver') || t === 'sent') return 'Sent';
    if (t.includes('waiting')) return 'Waiting';
    if (t.includes('ping') || t.includes('reminder')) return 'Ping';
    if (t.includes('slack')) return 'Slack';
    return (title || 'Update').replace(/\s+/g, ' ').trim();
};

const BEAT_LINE = {
    Video: 'Walkthrough sent',
    Queued: 'We queued the ask',
    Sent: 'They have the ask',
    Waiting: 'On them now',
    Ping: 'We followed up',
    Slack: 'We ping Slack',
};

const beatIcon = (row) => {
    const label = beatLabel(row.title);
    if (label === 'Video') return Video;
    if (label === 'Slack') return MessageSquare;
    if (label === 'Sent') return Check;
    if (label === 'Ping') return Mail;
    if (label === 'Waiting' || label === 'Queued') return Clock;
    return CHANNEL_ICON[row.channel] || Bot;
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
    if (!raw) return '';
    try {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return raw;
        return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    } catch {
        return raw;
    }
};

/**
 * Guest follow-up after a landing send: you assigned it, we run after them.
 */
const RobotRoomPage = () => {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [connectingSlack, setConnectingSlack] = useState(false);

    const isGuest = Boolean(room?.is_guest ?? user?.is_guest);

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/demo/room/${taskId}`);
            setRoom(data);
        } catch (error) {
            if (error?.response?.status === 404) toast.error('Gone. Send a new ask.');
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
            toast.info(typeof detail === 'string' ? detail : 'Keep the workspace, then connect Slack in Settings.');
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

    const startOver = () => {
        logout();
        navigate('/', { replace: true });
    };

    if (loading) {
        return (
            <div className="landing-page min-h-screen text-white flex items-center justify-center" style={{ background: '#050807' }}>
                <div className="text-white/50" data-testid="env-loading">…</div>
            </div>
        );
    }

    const task = room?.task || {};
    const activity = room?.activity || [];
    const channel = room?.channel || 'email';
    const delivered = Boolean(room?.delivered);
    const statusWord = delivered ? 'On them' : "We're on it";
    const who = task.assigned_to_name || task.assigned_to_email || 'them';
    const due = dueLabel(task.due_date);

    return (
        <div className="landing-page min-h-screen text-white" style={{ background: '#050807' }} data-testid="env-page">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-40 right-[-20%] w-[620px] h-[620px] rounded-full bg-teal-500/12 blur-[120px]" />
            </div>

            <nav className="relative z-10 max-w-xl mx-auto px-5 min-h-16 py-3 flex items-center justify-between gap-2">
                <button
                    type="button"
                    className="rounded-full hover:opacity-80"
                    onClick={startOver}
                    data-testid="env-brand-home"
                    aria-label="TskFlow"
                >
                    <TskFlowLogo variant="dark" size="sm" />
                </button>
                <div className="flex items-center gap-1">
                    {isGuest ? (
                        <Button
                            variant="ghost"
                            className="rounded-full text-white/70 hover:text-white hover:bg-white/10 h-10"
                            onClick={() => navigate('/login')}
                            data-testid="env-sign-in"
                        >
                            Sign in
                        </Button>
                    ) : (
                        <Button
                            className="rounded-full bg-white text-slate-950 hover:bg-teal-100 h-10"
                            onClick={() => navigate('/dashboard')}
                            data-testid="env-open-dashboard"
                        >
                            Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </nav>

            <main className="relative z-10 max-w-xl mx-auto px-5 pb-24">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col items-center text-center pt-6 sm:pt-10"
                >
                    <span
                        className={`w-14 h-14 rounded-full inline-flex items-center justify-center mb-4 ${
                            delivered
                                ? 'bg-teal-400/15 ring-1 ring-teal-300/30 text-teal-200'
                                : 'bg-amber-400/15 ring-1 ring-amber-300/25 text-amber-100'
                        }`}
                        aria-hidden
                    >
                        {delivered ? <CheckCircle2 className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
                    </span>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-3" data-testid="env-status">
                        {statusWord}
                    </p>
                    <p className="sr-only" data-testid="env-subcopy">{statusWord}</p>
                    <h1
                        className="text-2xl sm:text-3xl font-semibold leading-snug tracking-tight"
                        style={{ fontFamily: 'Outfit, sans-serif' }}
                        data-testid="env-ask"
                    >
                        {task.title}
                    </h1>
                    <p
                        className="mt-4 text-base sm:text-lg text-teal-100/90 leading-snug max-w-md"
                        data-testid="env-value"
                    >
                        You assigned it. We run after {who} until it's done.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs">
                        <span className="rounded-full bg-teal-400/15 text-teal-100 px-2.5 py-1" data-testid="env-assignee">
                            {task.assigned_to_name || task.assigned_to_email}
                        </span>
                        <span
                            className="rounded-full bg-white/[0.07] text-white/70 px-2.5 py-1 inline-flex items-center gap-1.5"
                            data-testid="env-channel"
                        >
                            {channel === 'slack' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                            {channel === 'slack' ? 'Slack' : 'Email'}
                        </span>
                        {due ? (
                            <span className="rounded-full bg-white/[0.07] text-white/70 px-2.5 py-1 inline-flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> {due}
                            </span>
                        ) : null}
                        {task.status ? (
                            <span className="rounded-full bg-white/[0.07] text-white/70 px-2.5 py-1 capitalize">
                                {String(task.status).replace(/_/g, ' ')}
                            </span>
                        ) : null}
                        {!delivered && (
                            <span
                                className="rounded-full bg-amber-400/15 text-amber-100 px-2.5 py-1"
                                data-testid="env-sample-note"
                            >
                                Sample
                            </span>
                        )}
                    </div>
                </motion.div>

                <p className="mt-10 text-[11px] uppercase tracking-[0.18em] text-white/45" data-testid="env-track-kicker">
                    We take it from here
                </p>
                <ol className="mt-3 env-track" data-testid="env-activity">
                    {activity.map((row, index) => {
                        const Icon = beatIcon(row);
                        const label = beatLabel(row.title);
                        const isSlack = label === 'Slack';
                        const Tag = isSlack ? 'button' : 'div';
                        return (
                            <li key={row.id || `${label}-${index}`} className="env-track-item">
                                <span className="env-track-dot">
                                    <Icon className="w-3.5 h-3.5" />
                                </span>
                                <Tag
                                    type={isSlack ? 'button' : undefined}
                                    className={`env-track-body ${isSlack ? 'env-track-action' : ''}`}
                                    onClick={isSlack ? connectSlack : undefined}
                                    disabled={isSlack ? connectingSlack : undefined}
                                    data-testid={isSlack ? "env-connect-slack" : undefined}
                                >
                                    <span className="env-track-title">{isSlack && connectingSlack ? 'Opening…' : (BEAT_LINE[label] || label)}</span>
                                    <span className="env-track-meta">{shortTime(row.created_at)}</span>
                                </Tag>
                            </li>
                        );
                    })}
                    {!activity.length && (
                        <li className="env-track-item">
                            <span className="env-track-dot">
                                <Bot className="w-3.5 h-3.5" />
                            </span>
                            <div className="env-track-body">
                                <span className="env-track-title">{statusWord}</span>
                            </div>
                        </li>
                    )}
                </ol>

                {isGuest && (
                    <div className="mt-10 space-y-3" data-testid="env-keep-workspace-panel">
                        <p className="text-center text-sm text-white/55" data-testid="env-keep-hint">
                            Keep this and we keep running it.
                        </p>
                        <Button
                            type="button"
                            onClick={keepWorkspace}
                            className="w-full rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 h-12 text-base font-medium"
                            data-testid="env-keep-workspace"
                        >
                            <Check className="w-4 h-4 mr-2" /> Keep workspace
                        </Button>
                        <div className="flex items-center justify-center gap-2">
                            <GoogleSignInButton
                                label="Google"
                                next={`/env/${taskId}`}
                                className="border-white/20 bg-transparent text-white hover:bg-white/10 h-10 px-4"
                                testId="env-google-continue"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={startOver}
                                className="rounded-full text-white/55 hover:text-white hover:bg-white/10 h-10"
                                data-testid="env-new-ask"
                            >
                                New ask
                            </Button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default RobotRoomPage;
