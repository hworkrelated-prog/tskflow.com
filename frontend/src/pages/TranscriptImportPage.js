import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Upload, Link2, Sparkles, AlertCircle, Send, Trash2, Search, SkipForward, ChevronRight } from 'lucide-react';
import DateTimePicker from '@/components/DateTimePicker';
import { format, parseISO } from 'date-fns';

const TranscriptImportPage = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const sessionFilter = params.get('session') || '';
    const [text, setText] = useState('');
    const [url, setUrl] = useState('');
    const [drafts, setDrafts] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [query, setQuery] = useState('');
    const [cursor, setCursor] = useState(0);

    const fetchDrafts = async (sid = sessionFilter) => {
        try {
            const res = await axios.get(`${API}/task-drafts`, { params: sid ? { session_id: sid } : {} });
            setDrafts(res.data.drafts || []);
            setSessions(res.data.sessions || []);
        } catch (_) { /* silent */ }
    };

    useEffect(() => {
        fetchDrafts();
        (async () => {
            try {
                const res = await axios.get(`${API}/users/mentionable`);
                setUsers(res.data || []);
            } catch (_) { /* silent */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionFilter]);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const t = await file.text();
        setText(t);
        toast.success(`Loaded ${file.name}`);
    };

    const importTranscript = async () => {
        if (!text.trim() && !url.trim()) {
            toast.error('Provide transcript text or a URL');
            return;
        }
        setLoading(true);
        try {
            const res = await axios.post(`${API}/task-drafts/from-transcript`, { text, url });
            const n = (res.data.drafts || []).length;
            toast.success(`Extracted ${n} draft${n === 1 ? '' : 's'} — knock them out one by one`);
            setText('');
            setUrl('');
            if (res.data.session_id) {
                setParams({ session: res.data.session_id });
            } else {
                fetchDrafts();
            }
            setCursor(0);
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to parse transcript');
        } finally { setLoading(false); }
    };

    const remaining = useMemo(() => {
        const q = query.trim().toLowerCase();
        return drafts.filter((d) => {
            if (!q) return true;
            const hay = `${d.title || ''} ${d.description || ''} ${d.assignee_hint || ''} ${d.assigned_to_name || ''} ${d.priority || ''}`.toLowerCase();
            return hay.includes(q);
        });
    }, [drafts, query]);

    useEffect(() => {
        if (cursor >= remaining.length) setCursor(0);
    }, [remaining.length, cursor]);

    const current = remaining[cursor] || null;

    const publishDraft = async (draft, form) => {
        try {
            await axios.post(`${API}/task-drafts/${draft.id}/publish`, form);
            toast.success('Task created');
            await fetchDrafts();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to publish');
        }
    };

    const deleteDraft = async (id) => {
        await axios.delete(`${API}/task-drafts/${id}`);
        await fetchDrafts();
    };

    const skipCurrent = () => {
        if (remaining.length < 2) return;
        setCursor((i) => (i + 1) % remaining.length);
    };

    return (
        <div className="min-h-screen bg-white">
            <header className="border-b bg-white sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4">
                    <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-2"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
                    <div className="flex items-center gap-2">
                        <FileText className="w-6 h-6 text-indigo-600" />
                        <h1 className="text-2xl font-semibold">Meet Transcript → Tasks</h1>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Paste, upload, or link a Google Doc. Knock out the most important tasks first — nothing goes live without your review.</p>
                </div>
            </header>
            <main className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
                <Card className="border-2 rounded-2xl">
                    <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600" /> Import a transcript</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-1 block flex items-center gap-2"><Link2 className="w-4 h-4" /> Public Google Doc URL</label>
                            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/..." className="rounded-xl" />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block flex items-center gap-2"><Upload className="w-4 h-4" /> Upload .txt / .md file</label>
                            <input type="file" accept=".txt,.md,.docx,text/*" onChange={handleFile} className="block w-full text-sm text-gray-600" />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Or paste transcript text</label>
                            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full meeting transcript here..." className="rounded-xl" />
                        </div>
                        <Button disabled={loading} onClick={importTranscript} className="rounded-full">
                            {loading ? 'Extracting...' : 'Extract Tasks with Jarvis'}
                        </Button>
                    </CardContent>
                </Card>

                {sessions.length > 0 && (
                    <div data-testid="transcript-sessions">
                        <h2 className="text-sm font-semibold text-slate-600 mb-2">Transcript sessions</h2>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setParams({})}
                                className={`text-xs rounded-full px-3 py-1.5 border ${!sessionFilter ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                            >
                                All ({sessions.reduce((n, s) => n + (s.remaining || 0), 0)})
                            </button>
                            {sessions.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setParams({ session: s.id })}
                                    className={`text-left text-xs rounded-full px-3 py-1.5 border max-w-[240px] truncate ${
                                        sessionFilter === s.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                                    title={s.preview}
                                >
                                    {s.top_title || 'Session'} · {s.remaining}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                        <h2 className="text-lg font-semibold flex-1">Knock out drafts ({remaining.length})</h2>
                        <div className="relative sm:w-64">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
                                placeholder="Search drafts…"
                                className="rounded-full pl-8 h-9 text-sm"
                                data-testid="transcript-search"
                            />
                        </div>
                    </div>

                    {remaining.length === 0 ? (
                        <div className="text-sm text-muted-foreground border rounded-xl p-6 text-center">
                            {drafts.length === 0 ? 'No drafts yet — import a transcript above.' : 'No drafts match that search.'}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {current && (
                                <DraftCard
                                    key={current.id}
                                    draft={current}
                                    users={users}
                                    index={cursor}
                                    total={remaining.length}
                                    onPublish={publishDraft}
                                    onDelete={deleteDraft}
                                    onSkip={skipCurrent}
                                />
                            )}
                            {remaining.length > 1 && (
                                <div className="rounded-2xl border border-slate-200 p-3 space-y-1.5" data-testid="transcript-up-next">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1">Up next</p>
                                    {remaining.filter((_, idx) => idx !== cursor).slice(0, 6).map((d) => (
                                        <button
                                            key={d.id}
                                            type="button"
                                            onClick={() => setCursor(remaining.findIndex((x) => x.id === d.id))}
                                            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-50 text-sm"
                                        >
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                                d.priority === 'Urgent' || d.priority === 'High'
                                                    ? 'bg-rose-50 text-rose-700'
                                                    : 'bg-slate-100 text-slate-600'
                                            }`}>{d.priority || 'Medium'}</span>
                                            <span className="truncate flex-1">{d.title}</span>
                                            <span className="text-[11px] text-slate-400 truncate max-w-[120px]">{d.assigned_to_name || d.assignee_hint || ''}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

const DraftCard = ({ draft, users, index, total, onPublish, onDelete, onSkip }) => {
    const bestId = draft.assigned_to || '';
    const [form, setForm] = useState({
        title: draft.title || '',
        description: draft.description || '',
        assigned_to: bestId,
        due_date: draft.due_date || '',
        priority: draft.priority || 'Medium',
        is_sales_task: false,
    });
    const [peopleQ, setPeopleQ] = useState('');

    useEffect(() => {
        setForm({
            title: draft.title || '',
            description: draft.description || '',
            assigned_to: draft.assigned_to || '',
            due_date: draft.due_date || '',
            priority: draft.priority || 'Medium',
            is_sales_task: false,
        });
        setPeopleQ('');
    }, [draft.id]);

    const filteredUsers = useMemo(() => {
        const q = peopleQ.trim().toLowerCase();
        const extra = (draft.assignee_candidates || []).filter((c) => c?.id);
        const byId = new Map();
        [...extra, ...(users || [])].forEach((u) => {
            if (u?.id && !byId.has(u.id)) byId.set(u.id, u);
        });
        let list = [...byId.values()];
        if (q) {
            list = list.filter((u) =>
                (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
            );
        }
        const candIds = extra.map((c) => c.id);
        list.sort((a, b) => {
            const score = (u) => (u.id === form.assigned_to ? 0 : candIds.includes(u.id) ? 1 : 2);
            return score(a) - score(b);
        });
        return list;
    }, [users, peopleQ, draft.assignee_candidates, form.assigned_to]);

    const fmtDue = (iso) => {
        if (!iso) return '';
        try { return format(parseISO(iso), "EEE MMM d 'at' h:mm a"); } catch { return iso; }
    };

    return (
        <div className="border-2 border-indigo-100 rounded-2xl p-4 shadow-sm bg-white" data-testid="transcript-knockout-card">
            <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs font-semibold text-indigo-700">
                    {index + 1} of {total}
                    {draft.importance ? ` · importance ${draft.importance}/10` : ''}
                </p>
                {draft.due_date && (
                    <p className="text-[11px] text-slate-500">{fmtDue(draft.due_date)}</p>
                )}
            </div>
            {draft.ambiguities?.length > 0 && (
                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
                    <div className="flex items-center gap-1 font-semibold mb-1"><AlertCircle className="w-4 h-4" /> Needs clarification</div>
                    <ul className="list-disc pl-5">{draft.ambiguities.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
            )}
            <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">Title</label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-lg" />
                    <label className="text-xs font-medium text-gray-600">Description</label>
                    <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-600">
                        Assignee {draft.assigned_to_name && <span className="text-teal-700">(best match: {draft.assigned_to_name})</span>}
                        {!draft.assigned_to_name && draft.assignee_hint && <span className="text-gray-400">(hint: {draft.assignee_hint})</span>}
                    </label>
                    <Input
                        value={peopleQ}
                        onChange={(e) => setPeopleQ(e.target.value)}
                        placeholder="Search people…"
                        className="rounded-lg h-9 text-sm"
                    />
                    <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">Select someone...</option>
                        {filteredUsers.map((u) => (<option key={u.id} value={u.id}>{u.name} &lt;{u.email}&gt;</option>))}
                    </select>
                    <label className="text-xs font-medium text-gray-600">
                        Due date & time {draft.due_date_hint && <span className="text-gray-400">(said: {draft.due_date_hint})</span>}
                    </label>
                    <DateTimePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} testId="transcript-due" />
                    <label className="text-xs font-medium text-gray-600">Priority</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option>Urgent</option><option>High</option><option>Medium</option><option>Low</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm mt-2">
                        <input type="checkbox" checked={form.is_sales_task} onChange={(e) => setForm({ ...form, is_sales_task: e.target.checked })} />
                        This is a Sales Task
                    </label>
                </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => onDelete(draft.id)} className="text-red-600"><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>
                {total > 1 && (
                    <Button variant="outline" onClick={onSkip} className="rounded-full">
                        <SkipForward className="w-4 h-4 mr-1" /> Skip
                    </Button>
                )}
                <Button onClick={() => {
                    if (!form.title || !form.assigned_to || !form.due_date) { toast.error('Fill title, assignee, and due date & time'); return; }
                    onPublish(draft, form);
                }} className="rounded-full"><Send className="w-4 h-4 mr-1" /> Publish & next</Button>
            </div>
        </div>
    );
};

export default TranscriptImportPage;
