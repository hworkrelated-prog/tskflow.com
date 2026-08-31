import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Check, Copy, Link2, Loader2, Lock } from 'lucide-react';
import { API } from '@/App';
import { FOUNDER_CALENDAR_URL } from '@/components/LandingFounder';
import { getErrorMessage } from '@/lib/utils';
import { forgetUnbiasslyRoom, listUnbiasslyGuestRooms, rememberUnbiasslyRoom } from '@/lib/unbiasslyGuest';

const EXPIRES = [
    { id: '24h', label: 'Closes in 24 hours' },
    { id: '48h', label: 'Closes in 48 hours' },
    { id: '7d', label: 'Closes in 7 days' },
    { id: 'never', label: 'Stays open until I conclude it' },
];

const HOURS = [
    { d: 'Mon', open: false },
    { d: 'Tue', open: true },
    { d: 'Wed', open: false },
    { d: 'Thu', open: true },
    { d: 'Fri', open: false },
];

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

/**
 * Anonymous feedback links. No login. Answers stay hidden until the organizer concludes.
 */
export default function LandingUnbiassly() {
    const [topic, setTopic] = useState('');
    const [prompt, setPrompt] = useState('');
    const [expiresIn, setExpiresIn] = useState('7d');
    const [email, setEmail] = useState('');
    const [creating, setCreating] = useState(false);
    const [working, setWorking] = useState('');
    const [room, setRoom] = useState(null);
    const [manageToken, setManageToken] = useState('');

    const loadLatest = useCallback(async () => {
        const stored = listUnbiasslyGuestRooms();
        if (!stored.length) return;
        try {
            const listed = await axios.post(`${API}/unbiassly/organizer/lookup`, {
                manage_tokens: stored.map((item) => item.manage_token),
            });
            const latest = (listed.data?.rooms || [])[0];
            if (!latest?.id) return;
            const match = stored.find((item) => item.id === latest.id) || stored[0];
            const res = await axios.get(`${API}/unbiassly/organizer/${match.manage_token}`);
            setRoom(res.data);
            setManageToken(match.manage_token);
        } catch {
            /* leave the create form up */
        }
    }, []);

    useEffect(() => {
        loadLatest();
    }, [loadLatest]);

    const createRoom = async (e) => {
        e.preventDefault();
        if (!topic.trim() || creating) return;
        setCreating(true);
        try {
            const res = await axios.post(`${API}/unbiassly/rooms`, {
                topic: topic.trim(),
                prompt: prompt.trim() || undefined,
                expires_in: expiresIn,
                organizer_email: email.trim() || undefined,
                email_updates: Boolean(email.trim()),
            });
            const created = res.data;
            rememberUnbiasslyRoom(created);
            setRoom(created);
            setManageToken(created.manage_token || '');
            setTopic('');
            setPrompt('');
            if (created.share_url) copyText(created.share_url);
            toast.success('Link ready. Share it.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not create the link'));
        } finally {
            setCreating(false);
        }
    };

    const conclude = async () => {
        if (!manageToken || working) return;
        setWorking('close');
        try {
            const res = await axios.post(`${API}/unbiassly/organizer/${manageToken}/close`);
            setRoom(res.data);
            toast.success('Link concluded. You can read the notes now.');
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not conclude'));
        } finally {
            setWorking('');
        }
    };

    const remove = async () => {
        if (!manageToken || working) return;
        if (!window.confirm('Delete this Unbiassly link and every anonymous note?')) return;
        setWorking('delete');
        try {
            await axios.delete(`${API}/unbiassly/organizer/${manageToken}`);
            forgetUnbiasslyRoom(room?.id);
            setRoom(null);
            setManageToken('');
            toast.success('Deleted');
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not delete'));
        } finally {
            setWorking('');
        }
    };

    const concluded = Boolean(room?.concluded || room?.status === 'closed');

    return (
        <section className="landing-unbiassly" data-testid="landing-unbiassly-panel" aria-label="Unbiassly">
            <h1 className="landing-unbiassly-title" data-testid="landing-unbiassly-title">
                Unbiassly
            </h1>
            <p className="landing-unbiassly-lead" data-testid="landing-unbiassly-lead">
                People hold back their honest thoughts when names and titles are in the room. If you really want to get to the bottom of something, share a link.
            </p>
            <p className="landing-unbiassly-sub" data-testid="landing-unbiassly-pain">
                No login. Send it to any group, any size. Answers stay hidden until you conclude the link, or until it expires.
            </p>

            {room ? (
                <div className="landing-unbiassly-result" data-testid="unbiassly-created">
                    <p className="landing-unbiassly-result-topic" data-testid="unbiassly-detail-topic">{room.topic}</p>
                    <p className="landing-unbiassly-sub">
                        {room.contribution_count || 0} {(room.contribution_count || 0) === 1 ? 'person has' : 'people have'} written.
                        {concluded ? ' Link concluded.' : ' Answers are sealed until you conclude.'}
                    </p>
                    <div className="landing-unbiassly-share">
                        <input
                            readOnly
                            value={room.share_url || ''}
                            className="landing-unbiassly-url"
                            data-testid="unbiassly-share-url"
                        />
                        <button
                            type="button"
                            className="landing-cta"
                            onClick={() => copyText(room.share_url)}
                            data-testid="unbiassly-copy-link"
                        >
                            <Copy className="w-4 h-4" aria-hidden /> Copy link
                        </button>
                    </div>
                    <div className="landing-unbiassly-actions">
                        {!concluded ? (
                            <button
                                type="button"
                                className="landing-cta"
                                onClick={conclude}
                                disabled={!!working}
                                data-testid="unbiassly-close"
                            >
                                {working === 'close' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                Conclude
                            </button>
                        ) : (
                            <span className="landing-unbiassly-done" data-testid="unbiassly-concluded">
                                <Check className="w-4 h-4" /> Concluded
                            </span>
                        )}
                        <button type="button" className="landing-unbiassly-textbtn" onClick={remove} data-testid="unbiassly-delete">
                            Delete
                        </button>
                    </div>
                    {concluded && (room.posts || []).length > 0 ? (
                        <ul className="landing-unbiassly-notes" data-testid="unbiassly-organizer-thread">
                            {room.posts.map((post) => (
                                <li key={post.id}>{post.body}</li>
                            ))}
                        </ul>
                    ) : null}
                    <button
                        type="button"
                        className="landing-unbiassly-textbtn"
                        onClick={() => { setRoom(null); setManageToken(''); }}
                        data-testid="unbiassly-new-link"
                    >
                        Create another link
                    </button>
                </div>
            ) : (
                <form className="landing-unbiassly-form" onSubmit={createRoom} data-testid="unbiassly-create-form">
                    <label className="landing-unbiassly-label" htmlFor="unbiassly-topic">What do you need the truth about?</label>
                    <input
                        id="unbiassly-topic"
                        data-testid="unbiassly-topic"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        maxLength={160}
                        placeholder="Should we keep Friday demos?"
                        className="landing-unbiassly-input"
                    />
                    <label className="landing-unbiassly-label" htmlFor="unbiassly-prompt">Optional prompt</label>
                    <textarea
                        id="unbiassly-prompt"
                        data-testid="unbiassly-prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        maxLength={800}
                        rows={3}
                        placeholder="Say what you actually think. No name is attached."
                        className="landing-unbiassly-input landing-unbiassly-textarea"
                    />
                    <label className="landing-unbiassly-label" htmlFor="unbiassly-expires">When should this close?</label>
                    <select
                        id="unbiassly-expires"
                        data-testid="unbiassly-expires"
                        value={expiresIn}
                        onChange={(e) => setExpiresIn(e.target.value)}
                        className="landing-unbiassly-input"
                    >
                        {EXPIRES.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                    </select>
                    <label className="landing-unbiassly-label" htmlFor="unbiassly-email">Email for the summary (optional)</label>
                    <input
                        id="unbiassly-email"
                        type="email"
                        data-testid="unbiassly-email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="landing-unbiassly-input"
                    />
                    <button
                        type="submit"
                        disabled={creating || topic.trim().length < 3}
                        className="landing-cta"
                        data-testid="unbiassly-create"
                    >
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        {creating ? 'Creating…' : 'Create a link'}
                    </button>
                </form>
            )}

            <div className="landing-unbiassly-hours" data-testid="unbiassly-office-hours">
                <p className="landing-unbiassly-hours-label">Hashim is on the calendar Tuesday and Thursday.</p>
                <div className="landing-unbiassly-week" aria-hidden>
                    {HOURS.map((day) => (
                        <span key={day.d} className={day.open ? 'is-open' : ''}>{day.d}</span>
                    ))}
                </div>
                <a
                    className="landing-founder-btn landing-founder-btn--ghost"
                    href={FOUNDER_CALENDAR_URL}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="unbiassly-book"
                >
                    Book a meeting
                </a>
            </div>
        </section>
    );
}
