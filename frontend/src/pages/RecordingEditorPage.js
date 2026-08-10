import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Check, ListPlus, Download, Video, Library, X, Plus } from 'lucide-react';
import { uploadBlob } from '@/lib/upload';
import { loadRecordingBlob, clearRecordingBlob, finalizeLiveRecording, loadLiveRecording } from '@/lib/recordingStore';
import { extForMime } from '@/lib/mediaRecorder';
import RichTextEditor from '@/components/RichTextEditor';

const defaultTitle = () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    let hh = now.getHours();
    const ap = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    const mn = String(now.getMinutes()).padStart(2, '0');
    return `Recording · ${now.getFullYear()}-${mm}-${dd} ${hh}:${mn} ${ap}`;
};

const RecordingEditorPage = () => {
    const navigate = useNavigate();
    const [blob, setBlob] = useState(null);
    const [videoUrl, setVideoUrl] = useState('');
    const [duration, setDuration] = useState(null);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [shareLink, setShareLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [showAssign, setShowAssign] = useState(false);
    const [title, setTitle] = useState(defaultTitle());
    const [uploadRef, setUploadRef] = useState(null); // cached upload result so we don't re-upload for "Assign as task"

    // Assign form state — mirrors TaskHub's create-task form
    const [users, setUsers] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const dropdownRef = useRef(null);
    const [selectedAssignees, setSelectedAssignees] = useState([]);
    const [assignForm, setAssignForm] = useState({
        title: 'Screen recording task',
        description: '',
        due_date: '',
        priority: 'Medium',
    });

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

        (async () => {
            try {
                const entry = await loadRecordingBlob();
                if (!cancelled && entry?.blob && entry.blob.size > 0) { setFromBlob(entry.blob); return; }
            } catch { /* silent */ }
            // Crash-recovery path: assemble any live chunks left behind mid-recording.
            try {
                const live = await loadLiveRecording();
                if (!cancelled && live?.chunks?.length) {
                    const recovered = await finalizeLiveRecording(live.meta?.mimeType);
                    if (recovered && recovered.size > 0) { setFromBlob(recovered); return; }
                }
            } catch { /* silent */ }
            if (tryOpenerBlob()) return;
            const url = sessionStorage.getItem('tsk_last_recording_url');
            if (url && !cancelled) setVideoUrl(url);
            let tries = 0;
            poll = setInterval(async () => {
                tries += 1;
                if (tryOpenerBlob()) { clearInterval(poll); return; }
                try {
                    const entry = await loadRecordingBlob();
                    if (entry?.blob && entry.blob.size > 0) { setFromBlob(entry.blob); clearInterval(poll); return; }
                } catch { /* silent */ }
                if (tries > 30) clearInterval(poll);
            }, 400);
        })();

        return () => { cancelled = true; if (poll) clearInterval(poll); };
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get(`${API}/users/mentionable`);
                setUsers(res.data || []);
            } catch { /* silent */ }
        })();
    }, []);

    // Close user dropdown on outside click
    useEffect(() => {
        const onDoc = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowUserDropdown(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const handleLoadedMetadata = (e) => {
        const d = e.target?.duration;
        if (d && Number.isFinite(d)) setDuration(d);
    };

    const ensureUploaded = async () => {
        if (uploadRef) return uploadRef;
        if (!blob) throw new Error('No recording data available');
        const ext = extForMime(blob.type);
        const filename = `recording-${Date.now()}.${ext}`;
        const ref = await uploadBlob(blob, filename, blob.type || 'video/webm', (p) => setUploadProgress(p));
        setUploadRef(ref);
        return ref;
    };

    const saveAndShare = async () => {
        if (!blob) { toast.error('No recording data available'); return; }
        setSaving(true);
        setUploadProgress(0);
        try {
            const ref = await ensureUploaded();
            const res = await axios.post(`${API}/recordings/standalone`, {
                recording_url: ref.storage_path || ref.path,
                title,
                duration_seconds: duration,
                size_bytes: blob?.size,
                mime_type: blob?.type,
            });
            setShareLink(res.data.shareable_link);
            toast.success('Recording saved to your library');
            try { await clearRecordingBlob(); } catch { /* noop */ }
        } catch (e) {
            toast.error(e?.response?.data?.detail || e?.message || 'Failed to save recording');
        } finally { setSaving(false); }
    };

    // Multi-assignee helpers (mirror TaskHub)
    const addEmailAssignee = () => {
        const emails = emailInput.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
        if (emails.length === 0) return;
        const next = [...selectedAssignees];
        emails.forEach((email) => {
            const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
            const exists = next.some((a) => (a.type === 'user' && a.email === email) || (a.type === 'email' && a.value === email));
            if (exists) return;
            if (found) next.push({ type: 'user', id: found.id, name: found.name, email: found.email });
            else next.push({ type: 'email', value: email });
        });
        setSelectedAssignees(next);
        setEmailInput('');
    };
    const removeAssignee = (idx) => setSelectedAssignees(selectedAssignees.filter((_, i) => i !== idx));
    const toggleUser = (u) => {
        const exists = selectedAssignees.some((a) => a.type === 'user' && a.id === u.id);
        if (exists) setSelectedAssignees(selectedAssignees.filter((a) => !(a.type === 'user' && a.id === u.id)));
        else setSelectedAssignees([...selectedAssignees, { type: 'user', id: u.id, name: u.name, email: u.email }]);
    };
    const handleEmailKeyDown = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmailAssignee(); } };

    const assignAsTask = async (e) => {
        if (e) e.preventDefault();
        if (!blob) { toast.error('No recording data available'); return; }
        if (!assignForm.title.trim()) { toast.error('Please add a title'); return; }
        if (selectedAssignees.length === 0) { toast.error('Please select at least one assignee'); return; }
        if (!assignForm.due_date) { toast.error('Please pick a due date'); return; }
        setSaving(true);
        try {
            const ref = await ensureUploaded();
            const recRes = await axios.post(`${API}/recordings/standalone`, {
                recording_url: ref.storage_path || ref.path,
                title,
                duration_seconds: duration,
                size_bytes: blob?.size,
                mime_type: blob?.type,
            });
            const linkNote = `\n\n<p>🎥 <a href="${recRes.data.shareable_link}" target="_blank" rel="noopener noreferrer">Screen recording</a></p>`;
            const description = (assignForm.description || '') + linkNote;

            const assigneeList = selectedAssignees.map((a) => a.type === 'user' ? a.id : a.value);
            if (assigneeList.length === 1) {
                await axios.post(`${API}/tasks`, {
                    title: assignForm.title,
                    description,
                    assigned_to: assigneeList[0],
                    due_date: assignForm.due_date,
                    priority: assignForm.priority,
                });
            } else {
                await axios.post(`${API}/tasks/bulk`, {
                    title: assignForm.title,
                    description,
                    assignees: assigneeList,
                    due_date: assignForm.due_date,
                    priority: assignForm.priority,
                });
            }
            toast.success('Task created with the recording attached');
            try { await clearRecordingBlob(); } catch { /* noop */ }
            setTimeout(() => { try { window.close(); } catch { /* noop */ } navigate('/dashboard'); }, 600);
        } catch (err) {
            toast.error(err?.response?.data?.detail || err?.message || 'Failed to create task');
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
        a.download = `recording-${Date.now()}.${extForMime(blob?.type)}`;
        a.click();
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Sticky header with Back + Library */}
            <header className="bg-white border-b sticky top-0 z-30">
                <div className="container mx-auto px-6 py-3 flex items-center gap-3 max-w-4xl">
                    <Button variant="ghost" size="sm" onClick={() => { try { if (window.opener) { window.close(); return; } } catch { /* noop */ } navigate('/dashboard'); }} className="rounded-full" data-testid="recording-back-btn">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold flex items-center gap-2"><Video className="w-4 h-4 text-indigo-600" /> Preview &amp; Share</h1>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate('/recordings')} className="rounded-full" data-testid="open-library-btn">
                        <Library className="w-4 h-4 mr-1" /> My library
                    </Button>
                </div>
            </header>

            <div className="container mx-auto px-6 py-6 max-w-4xl">
                <div className="bg-black rounded-2xl overflow-hidden mb-4">
                    {videoUrl ? (
                        <video src={videoUrl} controls autoPlay onLoadedMetadata={handleLoadedMetadata} className="w-full max-h-[60vh] bg-black" />
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

                {/* Title editor + download */}
                <div className="flex gap-2 items-center mb-4 flex-wrap">
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give this recording a name" className="rounded-full max-w-md" data-testid="recording-title-input" />
                    <Button variant="outline" onClick={downloadLocal} disabled={!videoUrl} className="rounded-full ml-auto"><Download className="w-4 h-4 mr-1" /> Download</Button>
                </div>

                {/* Primary action — Save & share (also stores in library) */}
                <div className="bg-white border-2 rounded-2xl p-5 mb-4">
                    {!shareLink ? (
                        <div className="flex flex-col items-start gap-3">
                            <p className="text-sm text-muted-foreground">Save this recording — you&apos;ll get a shareable link and it&apos;ll appear in your library.</p>
                            <Button onClick={saveAndShare} disabled={saving || !blob} className="rounded-full h-11 px-5" data-testid="save-share-btn">
                                {saving ? `Uploading ${uploadProgress}%...` : '💾 Save & get share link'}
                            </Button>
                            {saving && (
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                                <Check className="w-4 h-4" /> Saved! Anyone with this link can view your recording.
                            </div>
                            <div className="flex items-center gap-2">
                                <input value={shareLink} readOnly className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono" data-testid="share-link-input" />
                                <Button onClick={copyLink} variant="outline" className="rounded-full" data-testid="copy-share-btn">{copied ? <><Check className="w-4 h-4 mr-1" /> Copied</> : <><Copy className="w-4 h-4 mr-1" /> Copy</>}</Button>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                                <Button variant="outline" onClick={() => setShowAssign((v) => !v)} className="rounded-full" data-testid="toggle-assign-form-btn">
                                    <ListPlus className="w-4 h-4 mr-1" /> {showAssign ? 'Hide task form' : 'Assign as a task'}
                                </Button>
                                <Button variant="outline" onClick={() => navigate('/recordings')} className="rounded-full">
                                    <Library className="w-4 h-4 mr-1" /> Go to library
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Assign as task form — mirrors TaskHub's create-task form */}
                {(showAssign || !shareLink) && (
                    <div className="bg-white border-2 rounded-2xl p-5" data-testid="assign-form-panel">
                        {!showAssign && (
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-sm">Want to also assign this as a task?</h3>
                                <Button variant="ghost" size="sm" onClick={() => setShowAssign(true)} className="rounded-full">
                                    <ListPlus className="w-4 h-4 mr-1" /> Open form
                                </Button>
                            </div>
                        )}
                        {(showAssign) && (
                            <form onSubmit={assignAsTask} className="space-y-4">
                                <div>
                                    <Label htmlFor="ra-title">Title</Label>
                                    <Input id="ra-title" value={assignForm.title} onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })} className="rounded-xl" data-testid="assign-title-input" />
                                </div>

                                <div>
                                    <Label>Description</Label>
                                    <RichTextEditor value={assignForm.description} onChange={(val) => setAssignForm({ ...assignForm, description: val })} placeholder="Add context — the recording link will be attached automatically." />
                                </div>

                                <div ref={dropdownRef}>
                                    <Label>Assign to</Label>
                                    {selectedAssignees.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mb-2 mt-1">
                                            {selectedAssignees.map((a, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 border border-indigo-100 px-2 py-1 rounded-full text-xs">
                                                    {a.type === 'user' ? `${a.name} <${a.email}>` : a.value}
                                                    <button type="button" onClick={() => removeAssignee(i)} className="ml-0.5 hover:text-indigo-950"><X className="w-3 h-3" /></button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="relative">
                                        <Input
                                            placeholder="Type email and press Enter — or click a teammate below"
                                            value={emailInput}
                                            onChange={(e) => setEmailInput(e.target.value)}
                                            onFocus={() => setShowUserDropdown(true)}
                                            onKeyDown={handleEmailKeyDown}
                                            className="rounded-xl"
                                            data-testid="assign-email-input"
                                        />
                                        {showUserDropdown && users.length > 0 && (
                                            <div className="absolute z-20 mt-1 w-full bg-white border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                                {users.map((u) => {
                                                    const isSelected = selectedAssignees.some((a) => a.type === 'user' && a.id === u.id);
                                                    return (
                                                        <div key={u.id} onClick={() => toggleUser(u)} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 cursor-pointer ${isSelected ? 'bg-indigo-50' : ''}`}>
                                                            <Checkbox checked={isSelected} className="pointer-events-none" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{u.name}</p>
                                                                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">Select multiple teammates or type any email. Press Enter to add an email.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label>Due date</Label>
                                        <Input type="date" value={assignForm.due_date} onChange={(e) => setAssignForm({ ...assignForm, due_date: e.target.value })} className="rounded-xl" data-testid="assign-due-input" />
                                    </div>
                                    <div>
                                        <Label>Priority</Label>
                                        <Select value={assignForm.priority} onValueChange={(v) => setAssignForm({ ...assignForm, priority: v })}>
                                            <SelectTrigger className="rounded-xl" data-testid="assign-priority-select"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Low">Low</SelectItem>
                                                <SelectItem value="Medium">Medium</SelectItem>
                                                <SelectItem value="High">High</SelectItem>
                                                <SelectItem value="Urgent">Urgent</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <Button type="submit" disabled={saving || selectedAssignees.length === 0} className="w-full rounded-full h-11" data-testid="create-task-btn">
                                    <Plus className="w-4 h-4 mr-1" />
                                    {saving ? 'Creating...' : selectedAssignees.length > 1 ? `Create ${selectedAssignees.length} Tasks` : 'Create Task'}
                                </Button>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecordingEditorPage;
