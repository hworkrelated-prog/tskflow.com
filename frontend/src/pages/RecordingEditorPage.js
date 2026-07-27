import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Copy, Check, Share2, ListPlus, Download } from 'lucide-react';
import { uploadBlob } from '@/lib/upload';
import { loadRecordingBlob, clearRecordingBlob } from '@/lib/recordingStore';

const RecordingEditorPage = () => {
    const navigate = useNavigate();
    const [blob, setBlob] = useState(null);
    const [videoUrl, setVideoUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [shareLink, setShareLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [mode, setMode] = useState('share'); // 'share' | 'assign'
    const [assignForm, setAssignForm] = useState({ title: 'Screen recording task', description: '', assigned_to: '', due_date: '', priority: 'Medium' });
    const [users, setUsers] = useState([]);

    useEffect(() => {
        let cancelled = false;
        let poll = null;

        const setFromBlob = (b) => {
            if (cancelled) return;
            setBlob(b);
            try { setVideoUrl(URL.createObjectURL(b)); } catch { /* noop */ }
        };

        const tryOpenerBlob = () => {
            try {
                const w = window.opener || window;
                const b = w && w.__tskLastRecordingBlob;
                if (b && b.size > 0) { setFromBlob(b); return true; }
            } catch { /* opener not accessible (COOP) */ }
            return false;
        };

        // 1) Try IndexedDB first (most reliable across new tabs / COOP restrictions)
        (async () => {
            try {
                const entry = await loadRecordingBlob();
                if (!cancelled && entry?.blob && entry.blob.size > 0) {
                    setFromBlob(entry.blob);
                    return;
                }
            } catch { /* silent */ }

            // 2) Try opener bridge
            if (tryOpenerBlob()) return;

            // 3) Fall back to same-tab sessionStorage URL (only works if we navigated in same tab)
            const url = sessionStorage.getItem('tsk_last_recording_url');
            if (url && !cancelled) setVideoUrl(url);

            // 4) Poll IndexedDB + opener for a few seconds in case recording finishes late
            let tries = 0;
            poll = setInterval(async () => {
                tries += 1;
                if (tryOpenerBlob()) { clearInterval(poll); return; }
                try {
                    const entry = await loadRecordingBlob();
                    if (entry?.blob && entry.blob.size > 0) {
                        setFromBlob(entry.blob);
                        clearInterval(poll);
                        return;
                    }
                } catch { /* silent */ }
                if (tries > 30) clearInterval(poll);
            }, 400);
        })();

        return () => {
            cancelled = true;
            if (poll) clearInterval(poll);
        };
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get(`${API}/users/mentionable`);
                setUsers(res.data || []);
            } catch { /* silent */ }
        })();
    }, []);

    const saveAndShare = async () => {
        if (!blob) { toast.error('No recording data available'); return; }
        setSaving(true);
        setUploadProgress(0);
        try {
            const filename = `recording-${Date.now()}.webm`;
            const ref = await uploadBlob(blob, filename, blob.type || 'video/webm', (p) => setUploadProgress(p));
            const res = await axios.post(`${API}/recordings/standalone`, { recording_url: ref.storage_path || ref.path });
            setShareLink(res.data.shareable_link);
            toast.success('Recording saved!');
            try { await clearRecordingBlob(); } catch { /* noop */ }
        } catch (e) {
            toast.error(e?.response?.data?.detail || e?.message || 'Failed to save recording');
        } finally { setSaving(false); }
    };

    const assignAsTask = async () => {
        if (!blob) { toast.error('No recording data available'); return; }
        if (!assignForm.title || !assignForm.assigned_to || !assignForm.due_date) { toast.error('Fill title, assignee, and due date'); return; }
        setSaving(true);
        try {
            const filename = `recording-${Date.now()}.webm`;
            const ref = await uploadBlob(blob, filename, blob.type || 'video/webm');
            // Create standalone recording and then a task pointing at it
            const recRes = await axios.post(`${API}/recordings/standalone`, { recording_url: ref.storage_path || ref.path });
            const linkNote = `\n\n\ud83c\udfa5 Recording: ${recRes.data.shareable_link}`;
            await axios.post(`${API}/tasks`, {
                title: assignForm.title,
                description: (assignForm.description || '') + linkNote,
                assigned_to: assignForm.assigned_to,
                due_date: assignForm.due_date,
                priority: assignForm.priority,
            });
            toast.success('Task created with the recording attached');
            try { await clearRecordingBlob(); } catch { /* noop */ }
            setTimeout(() => { try { window.close(); } catch { /* noop */ } navigate('/dashboard'); }, 800);
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Failed to assign task');
        } finally { setSaving(false); }
    };

    const copyLink = () => {
        navigator.clipboard.writeText(shareLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadLocal = () => {
        if (!videoUrl) return;
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = `recording-${Date.now()}.webm`;
        a.click();
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="container mx-auto px-6 max-w-4xl">
                <h1 className="text-2xl font-semibold mb-4">Preview &amp; Share</h1>
                <div className="bg-black rounded-2xl overflow-hidden mb-6">
                    {videoUrl ? (
                        <video src={videoUrl} controls autoPlay className="w-full max-h-[60vh] bg-black" />
                    ) : (
                        <div className="p-10 text-center text-white">
                            <div className="inline-flex items-center gap-2 mb-3">
                                <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
                                <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '300ms' }} />
                            </div>
                            <p className="text-sm opacity-80">Looking for your recording...</p>
                            <p className="text-xs opacity-60 mt-1">If nothing appears in a few seconds, return to the previous tab and try recording again.</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-2 mb-4">
                    <button onClick={() => setMode('share')} className={`px-4 py-2 rounded-full text-sm font-medium ${mode === 'share' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200'}`}><Share2 className="w-4 h-4 inline mr-1" /> Share link</button>
                    <button onClick={() => setMode('assign')} className={`px-4 py-2 rounded-full text-sm font-medium ${mode === 'assign' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200'}`}><ListPlus className="w-4 h-4 inline mr-1" /> Assign as task</button>
                    <button onClick={downloadLocal} className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-200 ml-auto"><Download className="w-4 h-4 inline mr-1" /> Download</button>
                </div>

                {mode === 'share' && (
                    <div className="bg-white border-2 rounded-2xl p-5">
                        {!shareLink ? (
                            <>
                                <Button onClick={saveAndShare} disabled={saving || !blob} className="rounded-full">
                                    {saving ? `Uploading ${uploadProgress}%...` : 'Generate shareable link'}
                                </Button>
                                {saving && (
                                    <div className="mt-3 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <input value={shareLink} readOnly className="flex-1 border rounded px-3 py-2 text-sm bg-gray-50" />
                                <Button onClick={copyLink} variant="outline">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</Button>
                            </div>
                        )}
                    </div>
                )}

                {mode === 'assign' && (
                    <div className="bg-white border-2 rounded-2xl p-5 space-y-3">
                        <div>
                            <Label>Title</Label>
                            <Input value={assignForm.title} onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })} />
                        </div>
                        <div>
                            <Label>Description</Label>
                            <Textarea rows={3} value={assignForm.description} onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Assignee</Label>
                                <select className="w-full border rounded px-3 py-2 text-sm" value={assignForm.assigned_to} onChange={(e) => setAssignForm({ ...assignForm, assigned_to: e.target.value })}>
                                    <option value="">Select...</option>
                                    {users.map((u) => (<option key={u.id} value={u.id}>{u.name} &lt;{u.email}&gt;</option>))}
                                </select>
                            </div>
                            <div>
                                <Label>Due date</Label>
                                <Input type="date" value={assignForm.due_date} onChange={(e) => setAssignForm({ ...assignForm, due_date: e.target.value })} />
                            </div>
                        </div>
                        <div>
                            <Label>Priority</Label>
                            <select className="w-full border rounded px-3 py-2 text-sm" value={assignForm.priority} onChange={(e) => setAssignForm({ ...assignForm, priority: e.target.value })}>
                                <option>High</option><option>Medium</option><option>Low</option>
                            </select>
                        </div>
                        <Button onClick={assignAsTask} disabled={saving} className="rounded-full">
                            {saving ? 'Saving...' : 'Create task'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecordingEditorPage;
