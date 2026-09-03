import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Check, Copy, Loader2, Lock } from 'lucide-react';
import { API } from '@/App';
import { getErrorMessage } from '@/lib/utils';
import { forgetUnbiasslyRoom, listUnbiasslyGuestRooms, rememberUnbiasslyRoom } from '@/lib/unbiasslyGuest';
import UnbiasslyTopicBar from '@/components/UnbiasslyTopicBar';

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
 * Anonymous feedback links. No login. No names. Answers stay hidden until concluded.
 */
export default function LandingUnbiassly() {
    const [topic, setTopic] = useState('');
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
                email_updates: false,
            });
            const created = res.data;
            rememberUnbiasslyRoom(created);
            setRoom(created);
            setManageToken(created.manage_token || '');
            setTopic('');
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
                People hold back their honest thoughts when names and titles are in the room.
            </p>
            <p className="landing-unbiassly-sub" data-testid="landing-unbiassly-pain">
                No names. Share a link. Answers stay hidden until you conclude.
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
                <UnbiasslyTopicBar
                    topic={topic}
                    onChange={setTopic}
                    creating={creating}
                    onSubmit={createRoom}
                />
            )}
        </section>
    );
}
