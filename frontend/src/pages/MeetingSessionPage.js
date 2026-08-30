import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { API } from '@/App';
import { Button } from '@/components/ui/button';

const MeetingSessionPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [sending, setSending] = useState(false);

    const load = async () => {
        try {
            const res = await axios.get(`${API}/meetings/sessions/${sessionId}`);
            setSession(res.data);
        } catch {
            toast.error('Meeting not found');
            navigate('/dashboard');
        }
    };

    useEffect(() => { load(); }, [sessionId]);

    const vote = async (draftId, keep) => {
        try {
            const res = await axios.post(`${API}/meetings/sessions/${sessionId}/vote`, { draft_id: draftId, keep });
            setSession(res.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Could not update');
        }
    };

    const send = async () => {
        setSending(true);
        try {
            const res = await axios.post(`${API}/meetings/sessions/${sessionId}/publish`);
            toast.success(`Sent · ${res.data.sent}`);
            navigate('/dashboard');
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Only the organizer can send');
        } finally {
            setSending(false);
        }
    };

    if (!session) return <div className="page-shell min-h-screen" data-testid="meeting-session-loading" />;

    const drafts = session.drafts || [];

    return (
        <div className="page-shell min-h-screen pb-24" data-testid="meeting-session-page">
            <header className="border-b px-5 py-4 flex items-center justify-between">
                <button type="button" onClick={() => navigate('/dashboard')} className="text-sm text-muted-foreground">Back</button>
                <span className="integ-wordmark" data-testid="meet-session-title">{session.title || 'Meet'}</span>
                <span className="text-xs uppercase tracking-widest text-teal-700">{session.role}</span>
            </header>
            <main className="max-w-xl mx-auto px-4 py-8 space-y-3">
                {drafts.map((d, i) => (
                    <motion.button
                        key={d.id}
                        type="button"
                        data-testid={`meet-draft-${i}`}
                        onClick={() => vote(d.id, !!d.dropped)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: d.dropped ? 0.35 : 1, y: 0, scale: d.dropped ? 0.98 : 1 }}
                        className={`w-full text-left rounded-2xl border px-4 py-3 ${d.dropped ? 'border-dashed' : 'border-teal-200 bg-teal-50/60'}`}
                    >
                        <div className="font-semibold">{d.title}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                            <span>{d.assigned_to_name || d.assigned_to_email}</span>
                            <span>·</span>
                            <span>{(d.due_date || '').slice(0, 16).replace('T', ' ')}</span>
                        </div>
                    </motion.button>
                ))}
            </main>
            {session.can_publish && (
                <div className="fixed bottom-24 inset-x-0 flex justify-center px-4">
                    <Button
                        data-testid="meet-publish-btn"
                        onClick={send}
                        disabled={sending || drafts.filter((d) => !d.dropped).length === 0}
                        className="h-14 w-14 rounded-full bg-teal-500 hover:bg-teal-400 text-teal-950 text-lg font-bold shadow-lg"
                    >
                        →
                    </Button>
                </div>
            )}
        </div>
    );
};

export default MeetingSessionPage;
