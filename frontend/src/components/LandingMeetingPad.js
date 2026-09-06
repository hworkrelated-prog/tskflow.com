import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { API } from '@/App';
import { rememberGuestSession } from '@/lib/guestSession';
import { sessionId, trackLandingInteract } from '@/lib/productAnalytics';

const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const LandingMeetingPad = ({ onAuthed, login }) => {
    const [notes, setNotes] = useState('');
    const [drafts, setDrafts] = useState(null);
    const [pulling, setPulling] = useState(false);
    const [sending, setSending] = useState(false);

    const pull = async ({ sample = false, text = notes } = {}) => {
        const body = sample
            ? { use_sample: true, session_id: sessionId() }
            : { transcript: (text || '').trim(), session_id: sessionId() };
        if (!sample && !(body.transcript || '').trim()) {
            toast.error('Type or paste what people said.');
            return;
        }
        setPulling(true);
        try {
            const { data } = await axios.post(`${API}/demo/meeting-notes`, body);
            const rows = (data.drafts || []).map((row) => ({
                ...row,
                keep: true,
                assignee_email: row.assignee_email || '',
            }));
            setNotes(data.transcript || (sample ? text : notes));
            setDrafts(rows);
            trackLandingInteract('meeting_pull');
            if (!rows.length) {
                toast.error('No assignable tasks. Name who will do what.');
            }
        } catch (error) {
            const detail = error?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Could not pull tasks.');
        } finally {
            setPulling(false);
        }
    };

    const sendList = async () => {
        const kept = (drafts || []).filter((row) => row.keep);
        if (!kept.length) {
            toast.error('Keep at least one task.');
            return;
        }
        const missing = kept.filter((row) => !looksLikeEmail(row.assignee_email));
        if (missing.length) {
            toast.error('Add an email next to who owns it.');
            return;
        }
        setSending(true);
        try {
            const { data } = await axios.post(`${API}/demo/meeting-send`, {
                session_id: sessionId(),
                tasks: kept.map((row) => ({
                    title: row.title,
                    description: row.description || undefined,
                    assignee_email: row.assignee_email.trim(),
                    assignee_name: row.assignee_name || undefined,
                    due_date: row.due_date || undefined,
                })),
            });
            rememberGuestSession(data.user?.id, data.task_id);
            login(data.access_token, data.user);
            onAuthed(data.environment_url || `/env/${data.task_id}`);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Could not send that — try again.');
        } finally {
            setSending(false);
        }
    };

    const patch = (id, next) => {
        setDrafts((rows) => (rows || []).map((row) => (row.id === id ? { ...row, ...next } : row)));
    };

    return (
        <div className="landing-meet-pad" data-testid="landing-meeting-pad">
            <label className="sr-only" htmlFor="landing-meeting-notes">Meeting notes</label>
            <textarea
                id="landing-meeting-notes"
                data-testid="landing-meeting-notes"
                className="landing-meet-notes"
                value={notes}
                onChange={(e) => {
                    setNotes(e.target.value);
                    if (e.target.value.trim()) trackLandingInteract('meeting_notes');
                }}
                placeholder={"Maya: I'll send the Q3 forecast by Friday."}
                rows={8}
            />
            <div className="landing-meet-actions">
                <button
                    type="button"
                    className="landing-meet-ghost"
                    data-testid="landing-meeting-sample"
                    onClick={() => pull({ sample: true })}
                    disabled={pulling || sending}
                >
                    Use a sample
                </button>
                <button
                    type="button"
                    className="landing-cta"
                    data-testid="landing-meeting-pull"
                    onClick={() => pull()}
                    disabled={pulling || sending}
                >
                    {pulling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Pull the tasks
                </button>
            </div>
            {drafts ? (
                <ul className="landing-meet-list" data-testid="landing-meeting-list">
                    {drafts.map((row) => (
                        <li
                            key={row.id}
                            className={row.keep ? '' : 'is-dropped'}
                            data-testid={`landing-meeting-task-${row.id}`}
                        >
                            <button
                                type="button"
                                className="landing-meet-keep"
                                aria-pressed={row.keep}
                                onClick={() => patch(row.id, { keep: !row.keep })}
                            >
                                {row.keep ? 'Keep' : 'Drop'}
                            </button>
                            <div className="landing-meet-task">
                                <p className="landing-meet-title">{row.title}</p>
                                <p className="landing-meet-who">
                                    {row.assignee_name || 'Someone'}
                                    {row.due_hint ? ` · ${row.due_hint}` : ''}
                                </p>
                                <Input
                                    type="email"
                                    value={row.assignee_email}
                                    onChange={(e) => patch(row.id, { assignee_email: e.target.value })}
                                    placeholder="email@company.com"
                                    className="landing-meet-email"
                                    aria-label={`Email for ${row.assignee_name || row.title}`}
                                    autoComplete="email"
                                    disabled={!row.keep}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}
            {drafts?.length ? (
                <button
                    type="button"
                    className="landing-cta landing-meet-send"
                    data-testid="landing-meeting-send"
                    onClick={sendList}
                    disabled={sending}
                >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Send the list
                </button>
            ) : null}
        </div>
    );
};

export default LandingMeetingPad;
