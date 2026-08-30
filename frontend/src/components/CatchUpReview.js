import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import {
    X, AlertTriangle, Clock, AtSign, BellRing, CheckCheck,
    ChevronRight, Inbox,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { formatAppDateTime } from '@/lib/datetime';

const fmtDue = (iso) => {
    if (!iso) return '';
    try {
        return formatDistanceToNow(parseISO(iso), { addSuffix: true });
    } catch {
        return '';
    }
};

const Section = ({ icon, title, count, tone, children }) => {
    if (!count) return null;
    const tones = {
        rose: 'text-rose-700 bg-rose-50 border-rose-100',
        amber: 'text-amber-800 bg-amber-50 border-amber-100',
        teal: 'text-teal-800 bg-teal-50 border-teal-100',
        slate: 'text-slate-700 bg-slate-50 border-slate-100',
    };
    return (
        <div className="space-y-2">
            <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${tones[tone] || tones.slate}`}>
                {icon}
                {title}
                <span className="opacity-70">· {count}</span>
            </div>
            <div className="space-y-1.5">{children}</div>
        </div>
    );
};

const Row = ({ title, meta, onClick, testId }) => (
    <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-secondary/60 hover:bg-muted hover:border-border transition-colors"
    >
        <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{title}</div>
            {meta ? <div className="text-xs text-muted-foreground truncate mt-0.5">{meta}</div> : null}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
);

/**
 * Smart catch-up panel - one calm review instead of a storm of Chrome popups.
 * Opens from `tskflow:catch-up` (login) or via openCatchUp() / bell action.
 */
export const CatchUpReview = () => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async (detail) => {
        if (detail?.has_items != null) {
            setData(detail);
            if (detail.has_items) setOpen(true);
            return;
        }
        setLoading(true);
        try {
            const res = await axios.get(`${API}/notifications/catch-up`);
            setData(res.data);
            if (res.data?.has_items) setOpen(true);
            else setOpen(false);
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const onCatchUp = (e) => load(e.detail);
        const onOpen = () => load();
        window.addEventListener('tskflow:catch-up', onCatchUp);
        window.addEventListener('tskflow:open-catch-up', onOpen);
        return () => {
            window.removeEventListener('tskflow:catch-up', onCatchUp);
            window.removeEventListener('tskflow:open-catch-up', onOpen);
        };
    }, []);

    const markAllRead = async () => {
        try {
            await axios.post(`${API}/notifications/mark-all-read`);
            window.dispatchEvent(new CustomEvent('tskflow:notification'));
        } catch { /* silent */ }
        setOpen(false);
    };

    const goTask = (id, opts = {}) => {
        if (!id) return;
        setOpen(false);
        const tab = opts.tab ? `?tab=${opts.tab}` : '';
        navigate(`/task/${id}${tab}`);
    };

    if (!open || !data?.has_items) return null;

    const s = data.summary || {};
    const headlineParts = [];
    if (s.overdue_tasks) headlineParts.push(`${s.overdue_tasks} overdue`);
    if (s.due_soon_tasks) headlineParts.push(`${s.due_soon_tasks} due soon`);
    if (s.unread_mentions) headlineParts.push(`${s.unread_mentions} mention${s.unread_mentions === 1 ? '' : 's'}`);
    if (s.unread_nudges) headlineParts.push(`${s.unread_nudges} nudge${s.unread_nudges === 1 ? '' : 's'}`);
    if (!headlineParts.length && s.unread_reminders) headlineParts.push(`${s.unread_reminders} reminder${s.unread_reminders === 1 ? '' : 's'}`);
    if (!headlineParts.length && s.other_unread) headlineParts.push(`${s.other_unread} update${s.other_unread === 1 ? '' : 's'}`);

    return (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6" data-testid="catch-up-review">
            <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
            <div className="relative w-full sm:max-w-lg bg-card text-card-foreground rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border max-h-[min(88dvh,640px)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                <div className="px-5 pt-5 pb-3 border-b border-border">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                            <Inbox className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-semibold text-foreground">Catch up</h2>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {loading ? 'Loading…' : (headlineParts.join(' · ') || '')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"
                            aria-label="Close"
                            data-testid="catch-up-close"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
                    <Section
                        icon={<AlertTriangle className="w-3.5 h-3.5" />}
                        title="Overdue"
                        count={data.overdue?.length || 0}
                        tone="rose"
                    >
                        {(data.overdue || []).map((t) => (
                            <Row
                                key={t.id}
                                title={t.title}
                                meta={`${t.priority} · due ${fmtDue(t.due_date)}`}
                                onClick={() => goTask(t.id)}
                                testId={`catch-up-overdue-${t.id}`}
                            />
                        ))}
                    </Section>

                    <Section
                        icon={<Clock className="w-3.5 h-3.5" />}
                        title="Due in the next 24 hours"
                        count={data.due_soon?.length || 0}
                        tone="amber"
                    >
                        {(data.due_soon || []).map((t) => (
                            <Row
                                key={t.id}
                                title={t.title}
                                meta={`${t.priority} · due ${fmtDue(t.due_date)}`}
                                onClick={() => goTask(t.id)}
                                testId={`catch-up-soon-${t.id}`}
                            />
                        ))}
                    </Section>

                    <Section
                        icon={<AtSign className="w-3.5 h-3.5" />}
                        title="Mentions"
                        count={data.mentions?.length || 0}
                        tone="teal"
                    >
                        {(data.mentions || []).map((n) => (
                            <Row
                                key={n.id}
                                title={n.title}
                                meta={n.body}
                                onClick={() => goTask(n.task_id)}
                                testId={`catch-up-mention-${n.id}`}
                            />
                        ))}
                    </Section>

                    <Section
                        icon={<BellRing className="w-3.5 h-3.5" />}
                        title="Nudges & reminders"
                        count={(data.nudges?.length || 0) + (data.reminders?.length || 0)}
                        tone="slate"
                    >
                        {[...(data.nudges || []), ...(data.reminders || [])].slice(0, 12).map((n) => (
                            <Row
                                key={n.id}
                                title={n.title}
                                meta={[formatAppDateTime(n.sent_at || n.created_at), n.body].filter(Boolean).join(' · ')}
                                onClick={() => goTask(n.task_id, { tab: 'reminders' })}
                                testId={`catch-up-nudge-${n.id}`}
                            />
                        ))}
                    </Section>

                    {(data.other?.length || 0) > 0 && (
                        <Section icon={<Inbox className="w-3.5 h-3.5" />} title="Other updates" count={data.other.length} tone="slate">
                            {data.other.map((n) => (
                                <Row
                                    key={n.id}
                                    title={n.title}
                                    meta={n.body}
                                    onClick={() => goTask(n.task_id)}
                                    testId={`catch-up-other-${n.id}`}
                                />
                            ))}
                        </Section>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-2 bg-muted/50">
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={markAllRead}
                        data-testid="catch-up-mark-all"
                    >
                        <CheckCheck className="w-4 h-4 mr-1.5" /> Mark all reviewed
                    </Button>
                    <Button
                        size="sm"
                        className="rounded-full ml-auto bg-teal-700 hover:bg-teal-800"
                        onClick={() => setOpen(false)}
                        data-testid="catch-up-done"
                    >
                        Got it
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default CatchUpReview;
