import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { API, useAuth } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getErrorMessage } from '@/lib/utils';
import { pinDocumentTheme, restoreDocumentTheme } from '@/lib/theme';
import LandingUnbiassly from '@/components/LandingUnbiassly';
import TskFlowLogo from '@/components/TskFlowLogo';
import {
    ArrowLeft, Check, Copy, Link2, Loader2, Mail, RefreshCw, Scale, Trash2, Lock,
} from 'lucide-react';

const relative = (iso) => {
    if (!iso) return '';
    try {
        return formatDistanceToNow(parseISO(iso), { addSuffix: true });
    } catch {
        return '';
    }
};

const copyText = async (value) => {
    try {
        await navigator.clipboard.writeText(value);
        toast.success('Link copied');
        return true;
    } catch {
        toast.error('Could not copy. Select the link instead.');
        return false;
    }
};

const UnbiasslyPublicIntro = () => {
    const navigate = useNavigate();

    useEffect(() => {
        pinDocumentTheme('dark');
        document.body.classList.add('landing-active');
        return () => {
            document.body.classList.remove('landing-active');
            restoreDocumentTheme();
        };
    }, []);

    return (
        <div
            className="landing-page landing-tool landing-visual min-h-screen text-white flex flex-col"
            style={{ background: '#050807' }}
            data-testid="unbiassly-intro"
        >
            <header className="relative z-20 shrink-0 sticky top-0 bg-[#050807]/90 backdrop-blur-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 landing-toolbar-row flex items-center gap-3">
                    <button
                        type="button"
                        className="landing-brand-btn"
                        onClick={() => navigate('/')}
                        aria-label="TskFlow home"
                    >
                        <TskFlowLogo variant="dark" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="landing-tabs-link ml-auto"
                        onClick={() => navigate('/')}
                    >
                        TskFlow
                    </button>
                </div>
            </header>
            <main className="relative z-10 flex-1 flex flex-col">
                <LandingUnbiassly />
            </main>
        </div>
    );
};

const TrendBars = ({ trends }) => {
    if (!trends?.length) {
        return <p className="text-sm text-muted-foreground">Trends show up once a few people have written.</p>;
    }
    const max = Math.max(...trends.map((t) => Number(t.count) || 0), 1);
    return (
        <div className="space-y-3" data-testid="unbiassly-trends">
            {trends.map((t) => (
                <div key={t.label} data-testid={`unbiassly-trend-${t.label}`}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-800">{t.label}</span>
                        <span className="text-xs text-slate-500">{t.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-teal-600"
                            style={{ width: `${Math.max(8, (100 * (Number(t.count) || 0)) / max)}%` }}
                        />
                    </div>
                    {t.note ? <p className="text-xs text-slate-500 mt-1">{t.note}</p> : null}
                </div>
            ))}
        </div>
    );
};

const UnbiasslyHub = () => {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [topic, setTopic] = useState('');
    const [creating, setCreating] = useState(false);
    const [selectedId, setSelectedId] = useState(searchParams.get('room') || '');
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [working, setWorking] = useState('');

    const fetchRooms = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/unbiassly/rooms`);
            setRooms(res.data?.rooms || []);
        } catch (e) {
            toast.error(getErrorMessage(e, 'Could not load Unbiassly'));
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchDetail = useCallback(async (id) => {
        if (!id) {
            setDetail(null);
            return;
        }
        setDetailLoading(true);
        try {
            const res = await axios.get(`${API}/unbiassly/rooms/${id}`);
            setDetail(res.data);
        } catch (e) {
            toast.error(getErrorMessage(e, 'Could not open that discussion'));
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const publicMode = !user || Boolean(user.is_guest);

    useEffect(() => {
        if (publicMode) {
            setLoading(false);
            return;
        }
        fetchRooms();
    }, [fetchRooms, publicMode]);

    useEffect(() => {
        if (publicMode) return;
        const id = searchParams.get('room') || '';
        setSelectedId(id);
        fetchDetail(id);
    }, [searchParams, fetchDetail, publicMode]);

    const selectRoom = (id) => {
        const next = new URLSearchParams(searchParams);
        if (id) next.set('room', id);
        else next.delete('room');
        setSearchParams(next, { replace: true });
    };

    const createRoom = async (e) => {
        e.preventDefault();
        if (!topic.trim() || creating) return;
        setCreating(true);
        try {
            const res = await axios.post(`${API}/unbiassly/rooms`, {
                topic: topic.trim(),
                expires_in: '7d',
                email_updates: true,
            });
            const room = res.data;
            toast.success('Link ready. Share it.');
            setTopic('');
            await fetchRooms();
            selectRoom(room.id);
            if (room.share_url) copyText(room.share_url);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not create the link'));
        } finally {
            setCreating(false);
        }
    };

    const runAction = async (key, fn, okMessage) => {
        if (!detail?.id || working) return;
        setWorking(key);
        try {
            const result = await fn();
            if (result) setDetail(result);
            await fetchRooms();
            if (okMessage) toast.success(okMessage);
        } catch (err) {
            toast.error(getErrorMessage(err, 'That did not work'));
        } finally {
            setWorking('');
        }
    };

    const refreshInsights = () => runAction(
        'summary',
        async () => (await axios.post(`${API}/unbiassly/rooms/${detail.id}/summary`)).data,
        'Insights updated',
    );

    const emailSummary = () => runAction(
        'email',
        async () => {
            await axios.post(`${API}/unbiassly/rooms/${detail.id}/email-summary`);
            return null;
        },
        'Summary sent to your email',
    );

    const closeRoom = () => runAction(
        'close',
        async () => (await axios.post(`${API}/unbiassly/rooms/${detail.id}/close`)).data,
        'Discussion concluded. You can read the notes now.',
    );

    const deleteRoom = async () => {
        if (!detail?.id || working) return;
        if (!window.confirm('Delete this Unbiassly link and every anonymous note?')) return;
        setWorking('delete');
        try {
            await axios.delete(`${API}/unbiassly/rooms/${detail.id}`);
            toast.success('Deleted');
            selectRoom('');
            setDetail(null);
            await fetchRooms();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not delete'));
        } finally {
            setWorking('');
        }
    };

    const summary = detail?.summary;
    const selectedMeta = useMemo(
        () => rooms.find((r) => r.id === selectedId),
        [rooms, selectedId],
    );

    if (authLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gradient-mesh gap-3" data-testid="unbiassly-boot">
                <div className="w-10 h-10 rounded-xl bg-teal-700 flex items-center justify-center text-white">
                    <Scale className="w-5 h-5" />
                </div>
                <div className="text-lg font-medium">Loading…</div>
            </div>
        );
    }

    if (publicMode) {
        return <UnbiasslyPublicIntro />;
    }

    return (
        <div className="page-shell" data-testid="unbiassly-hub">
            <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
                <div className="container mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="rounded-full" data-testid="unbiassly-back">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
                            <Scale className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold leading-tight" style={{ fontFamily: 'Outfit' }} data-testid="unbiassly-wordmark">
                                Unbiassly
                            </h1>
                            <p className="text-xs text-muted-foreground truncate">People hold back when names and titles are in the room.</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-6 items-start">
                    <section className="space-y-4">
                        <Card className="rounded-2xl border-2 shadow-soft" data-testid="unbiassly-create-card">
                            <CardContent className="p-5 sm:p-6">
                                <h2 className="font-semibold mb-1" style={{ fontFamily: 'Outfit' }}>Create a link</h2>
                                <p className="text-sm text-muted-foreground mb-4">A topic. No names. Share the link.</p>
                                <form onSubmit={createRoom} className="flex flex-col sm:flex-row gap-2" data-testid="unbiassly-create-form">
                                    <label className="sr-only" htmlFor="unbiassly-topic">Topic for discussion or feedback</label>
                                    <Input
                                        id="unbiassly-topic"
                                        data-testid="unbiassly-topic"
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        maxLength={160}
                                        placeholder="A topic for discussion or feedback"
                                        className="rounded-full"
                                        autoComplete="off"
                                    />
                                    <Button
                                        type="submit"
                                        disabled={creating || topic.trim().length < 3}
                                        className="rounded-full shrink-0 bg-teal-700 hover:bg-teal-800"
                                        data-testid="unbiassly-create"
                                    >
                                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                        {creating ? 'Creating…' : 'Create a link'}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>

                        <div className="space-y-2" data-testid="unbiassly-room-list">
                            <h2 className="text-sm font-medium text-slate-500 px-1">Your links</h2>
                            {loading ? (
                                <p className="text-sm text-muted-foreground px-1 py-6">Loading…</p>
                            ) : rooms.length === 0 ? (
                                <p className="text-sm text-muted-foreground px-1 py-4" data-testid="unbiassly-empty">
                                    None yet. Make a link and send it out.
                                </p>
                            ) : rooms.map((room) => (
                                <button
                                    key={room.id}
                                    type="button"
                                    onClick={() => selectRoom(room.id)}
                                    data-testid={`unbiassly-room-${room.id}`}
                                    className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors ${
                                        selectedId === room.id
                                            ? 'border-teal-600 bg-teal-50/80'
                                            : 'border-slate-200 bg-white hover:border-teal-300'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="font-medium text-slate-900 truncate">{room.topic}</p>
                                        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wide">
                                            {room.status}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {room.contribution_count} note{room.contribution_count === 1 ? '' : 's'}
                                        {room.headline ? ` · ${room.headline}` : ''}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section>
                        {!selectedId ? (
                            <Card className="rounded-2xl border-dashed border-2 min-h-[18rem] flex items-center justify-center">
                                <CardContent className="text-center py-12">
                                    <Scale className="w-10 h-10 mx-auto text-teal-400 mb-3" />
                                    <p className="font-medium">Create a link, or open one you already made</p>
                                    <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                                        Names and titles stay off the page. Answers stay sealed until you conclude.
                                    </p>
                                </CardContent>
                            </Card>
                        ) : detailLoading && !detail ? (
                            <p className="text-sm text-muted-foreground py-16 text-center">Opening…</p>
                        ) : detail ? (
                            <div className="space-y-4" data-testid="unbiassly-organizer-detail">
                                <Card className="rounded-2xl border-2">
                                    <CardContent className="p-5 sm:p-6 space-y-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h2 className="text-xl font-bold" style={{ fontFamily: 'Outfit' }} data-testid="unbiassly-detail-topic">
                                                    {detail.topic}
                                                </h2>
                                                {detail.prompt ? (
                                                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{detail.prompt}</p>
                                                ) : null}
                                            </div>
                                            <Badge className={detail.status === 'open' ? 'bg-teal-700 text-white' : 'bg-slate-600 text-white'}>
                                                {detail.status}
                                            </Badge>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <Input
                                                readOnly
                                                value={detail.share_url || ''}
                                                className="rounded-xl font-mono text-xs"
                                                data-testid="unbiassly-share-url"
                                            />
                                            <Button
                                                type="button"
                                                onClick={() => copyText(detail.share_url)}
                                                className="rounded-full shrink-0 bg-teal-700 hover:bg-teal-800"
                                                data-testid="unbiassly-copy-link"
                                            >
                                                <Copy className="w-4 h-4" /> Copy link
                                            </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="rounded-full"
                                                onClick={refreshInsights}
                                                disabled={!!working}
                                                data-testid="unbiassly-refresh-insights"
                                            >
                                                {working === 'summary' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                Refresh insights
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="rounded-full"
                                                onClick={emailSummary}
                                                disabled={!!working || !detail.contribution_count}
                                                data-testid="unbiassly-email-summary"
                                            >
                                                {working === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                                Email me the summary
                                            </Button>
                                            {detail.status === 'open' && !detail.concluded ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="rounded-full"
                                                    onClick={closeRoom}
                                                    disabled={!!working}
                                                    data-testid="unbiassly-close"
                                                >
                                                    {working === 'close' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                                    Conclude
                                                </Button>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs text-slate-500 px-2">
                                                    <Check className="w-3.5 h-3.5" /> Concluded {relative(detail.closed_at)}
                                                </span>
                                            )}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="rounded-full text-red-600 hover:text-red-700"
                                                onClick={deleteRoom}
                                                disabled={!!working}
                                                data-testid="unbiassly-delete"
                                            >
                                                <Trash2 className="w-4 h-4" /> Delete
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>

                                {detail.answers_visible || detail.concluded ? (
                                <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Card className="rounded-2xl" data-testid="unbiassly-summary-card">
                                        <CardContent className="p-5 space-y-3">
                                            <p className="text-xs uppercase tracking-wider text-teal-800 font-semibold">Summary</p>
                                            <p className="font-semibold text-slate-900" data-testid="unbiassly-headline">
                                                {summary?.headline || selectedMeta?.headline || 'Waiting on the first notes.'}
                                            </p>
                                            <p className="text-sm text-slate-600 leading-relaxed" data-testid="unbiassly-overview">
                                                {summary?.overview}
                                            </p>
                                            <div>
                                                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Highlights</p>
                                                {summary?.highlights?.length ? (
                                                    <ul className="space-y-2" data-testid="unbiassly-highlights">
                                                        {summary.highlights.map((h, i) => (
                                                            <li key={i} className="text-sm text-slate-700 border-l-2 border-teal-500 pl-3">
                                                                {h}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">Highlights appear after people write.</p>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card className="rounded-2xl">
                                        <CardContent className="p-5">
                                            <p className="text-xs uppercase tracking-wider text-teal-800 font-semibold mb-3">Trends</p>
                                            <TrendBars trends={summary?.trends} />
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card className="rounded-2xl" data-testid="unbiassly-organizer-thread">
                                    <CardContent className="p-5 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Anonymous notes</p>
                                            <span className="text-xs text-slate-500">{detail.contribution_count || 0}</span>
                                        </div>
                                        {(detail.posts || []).length === 0 ? (
                                            <p className="text-sm text-muted-foreground py-6">Nothing yet. Share the link.</p>
                                        ) : (
                                            <ul className="space-y-3">
                                                {detail.posts.map((post) => (
                                                    <li key={post.id} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3" data-testid={`unbiassly-post-${post.id}`}>
                                                        <p className="text-sm text-slate-800 whitespace-pre-wrap">{post.body}</p>
                                                        <p className="text-[11px] text-slate-400 mt-2">Anonymous · {relative(post.created_at)}</p>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </CardContent>
                                </Card>
                                </>
                                ) : (
                                <Card className="rounded-2xl" data-testid="unbiassly-sealed">
                                    <CardContent className="p-5 text-sm text-slate-600">
                                        {detail.contribution_count || 0} {(detail.contribution_count || 0) === 1 ? 'person has' : 'people have'} written. Answers stay hidden until you conclude this link.
                                    </CardContent>
                                </Card>
                                )}
                            </div>
                        ) : null}
                    </section>
                </div>
            </main>
        </div>
    );
};

export default UnbiasslyHub;
