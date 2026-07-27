import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Upload, Link2, Sparkles, AlertCircle, Send, Trash2 } from 'lucide-react';

const TranscriptImportPage = () => {
    const navigate = useNavigate();
    const [text, setText] = useState('');
    const [url, setUrl] = useState('');
    const [drafts, setDrafts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);

    const fetchDrafts = async () => {
        try {
            const res = await axios.get(`${API}/task-drafts`);
            setDrafts(res.data.drafts || []);
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
    }, []);

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
            toast.success(`Extracted ${res.data.drafts.length} draft(s)`);
            setText(''); setUrl('');
            fetchDrafts();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to parse transcript');
        } finally { setLoading(false); }
    };

    const publishDraft = async (draft, form) => {
        try {
            await axios.post(`${API}/task-drafts/${draft.id}/publish`, form);
            toast.success('Task created');
            fetchDrafts();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to publish');
        }
    };

    const deleteDraft = async (id) => {
        await axios.delete(`${API}/task-drafts/${id}`);
        fetchDrafts();
    };

    return (
        <div className="min-h-screen bg-white">
            <header className="border-b bg-white sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4">
                    <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-2"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
                    <div className="flex items-center gap-2">
                        <FileText className="w-6 h-6 text-indigo-600" />
                        <h1 className="text-2xl font-semibold">Meet Transcript &rarr; Tasks</h1>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Paste, upload, or link a Google Doc. Jarvis will draft tasks &mdash; nothing goes live without your review.</p>
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

                <div>
                    <h2 className="text-lg font-semibold mb-3">Pending drafts ({drafts.length})</h2>
                    <div className="space-y-3">
                        {drafts.length === 0 && (<div className="text-sm text-muted-foreground border rounded-xl p-6 text-center">No drafts yet.</div>)}
                        {drafts.map((d) => (<DraftCard key={d.id} draft={d} users={users} onPublish={publishDraft} onDelete={deleteDraft} />))}
                    </div>
                </div>
            </main>
        </div>
    );
};

const DraftCard = ({ draft, users, onPublish, onDelete }) => {
    const [form, setForm] = useState({
        title: draft.title || '',
        description: draft.description || '',
        assigned_to: '',
        due_date: '',
        priority: draft.priority || 'Medium',
        is_sales_task: false,
    });
    return (
        <div className="border-2 rounded-2xl p-4">
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
                    <label className="text-xs font-medium text-gray-600">Assignee {draft.assignee_hint && <span className="text-gray-400">(hint: {draft.assignee_hint})</span>}</label>
                    <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">Select someone...</option>
                        {users.map((u) => (<option key={u.id} value={u.id}>{u.name} &lt;{u.email}&gt;</option>))}
                    </select>
                    <label className="text-xs font-medium text-gray-600">Due date {draft.due_date_hint && <span className="text-gray-400">(hint: {draft.due_date_hint})</span>}</label>
                    <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="rounded-lg" />
                    <label className="text-xs font-medium text-gray-600">Priority</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option>High</option><option>Medium</option><option>Low</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm mt-2">
                        <input type="checkbox" checked={form.is_sales_task} onChange={(e) => setForm({ ...form, is_sales_task: e.target.checked })} />
                        This is a Sales Task
                    </label>
                </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => onDelete(draft.id)} className="text-red-600"><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>
                <Button onClick={() => {
                    if (!form.title || !form.assigned_to || !form.due_date) { toast.error('Fill title, assignee, and due date'); return; }
                    onPublish(draft, form);
                }} className="rounded-full"><Send className="w-4 h-4 mr-1" /> Publish task</Button>
            </div>
        </div>
    );
};

export default TranscriptImportPage;
