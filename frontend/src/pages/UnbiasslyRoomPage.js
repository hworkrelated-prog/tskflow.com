import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/utils';
import { Loader2, Scale, Send } from 'lucide-react';

const UnbiasslyRoomPage = () => {
    const { token } = useParams();
    const [room, setRoom] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async ({ silent } = {}) => {
        if (!token) return;
        try {
            const res = await axios.get(`${API}/unbiassly/${token}`);
            setRoom(res.data);
            setError('');
        } catch (e) {
            if (!silent) {
                setError(getErrorMessage(e, 'This Unbiassly link was not found'));
                setRoom(null);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!token || room?.status === 'closed') return undefined;
        const tick = () => {
            if (document.visibilityState === 'visible') load({ silent: true });
        };
        const id = setInterval(tick, 8000);
        document.addEventListener('visibilitychange', tick);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [token, room?.status, load]);

    const send = async (e) => {
        e.preventDefault();
        const text = body.trim();
        if (!text || sending) return;
        setSending(true);
        try {
            const res = await axios.post(`${API}/unbiassly/${token}/posts`, { body: text });
            setRoom(res.data);
            setBody('');
            toast.success('Posted anonymously. It stays hidden until the organizer concludes.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not post'));
        } finally {
            setSending(false);
        }
    };

    const closed = room?.status === 'closed' || room?.concluded;

    return (
        <div className="unbiassly-public min-h-screen flex flex-col" data-testid="unbiassly-public">
            <header className="border-b border-teal-900/10 bg-[#f6f3ec]/90 backdrop-blur sticky top-0 z-10">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-800 text-white flex items-center justify-center">
                        <Scale className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="unbiassly-public-brand">
                            Unbiassly
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">People hold back when names and titles are in the room.</p>
                    </div>
                    <Link to="/" className="ml-auto text-xs text-slate-500 hover:text-teal-800" data-testid="unbiassly-to-tskflow">
                        TskFlow
                    </Link>
                </div>
            </header>

            <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8">
                {loading ? (
                    <p className="text-center text-slate-500 py-16">Opening the discussion…</p>
                ) : error ? (
                    <div className="text-center py-16" data-testid="unbiassly-public-error">
                        <Scale className="w-10 h-10 mx-auto text-teal-700/40 mb-3" />
                        <p className="font-medium text-slate-800">{error}</p>
                        <Link to="/" className="text-sm text-teal-800 underline mt-3 inline-block">Back to TskFlow</Link>
                    </div>
                ) : (
                    <>
                        <section className="mb-8">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-teal-800 font-semibold mb-2">Discussion</p>
                            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight" style={{ fontFamily: 'Outfit, sans-serif' }} data-testid="unbiassly-public-topic">
                                {room.topic}
                            </h1>
                            {room.prompt ? (
                                <p className="mt-3 text-slate-600 leading-relaxed whitespace-pre-wrap" data-testid="unbiassly-public-prompt">
                                    {room.prompt}
                                </p>
                            ) : null}
                            <p className="mt-3 text-xs text-slate-500" data-testid="unbiassly-public-count">
                                {room.contribution_count || 0} {(room.contribution_count || 0) === 1 ? 'person has' : 'people have'} written
                                {closed ? ' · Concluded' : '. Answers stay hidden until this link is concluded.'}
                            </p>
                        </section>

                        {closed ? (
                            <p className="text-sm text-slate-500 py-6" data-testid="unbiassly-public-closed">
                                This link is concluded. Notes were collected for the organizer. New notes are not being taken.
                            </p>
                        ) : (
                            <>
                            <p className="text-sm text-slate-600 py-4 rounded-2xl bg-white/70 border border-stone-200 px-4 mb-8" data-testid="unbiassly-answers-hidden">
                                Nobody sees the answers until the organizer concludes this link. Write what you actually think.
                            </p>
                            <form onSubmit={send} className="sticky bottom-4 rounded-2xl border border-stone-200 bg-white/95 shadow-lg p-4" data-testid="unbiassly-compose">
                                <label htmlFor="unbiassly-body" className="text-xs font-medium text-slate-600">
                                    Your note stays anonymous
                                </label>
                                <Textarea
                                    id="unbiassly-body"
                                    data-testid="unbiassly-body"
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    maxLength={2000}
                                    rows={4}
                                    placeholder="Say it plainly. No account. No name."
                                    className="mt-2 rounded-xl bg-[#fbfaf6]"
                                />
                                <div className="mt-3 flex items-center justify-between gap-3">
                                    <span className="text-[11px] text-slate-400">{body.length}/2000</span>
                                    <Button
                                        type="submit"
                                        disabled={sending || body.trim().length < 3}
                                        className="rounded-full bg-teal-800 hover:bg-teal-900"
                                        data-testid="unbiassly-send"
                                    >
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        {sending ? 'Posting…' : 'Post anonymously'}
                                    </Button>
                                </div>
                            </form>
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
};

export default UnbiasslyRoomPage;
