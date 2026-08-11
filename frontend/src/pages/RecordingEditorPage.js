import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Check, Download, Video, Library, Trash2, Link2 } from 'lucide-react';
import { uploadBlob } from '@/lib/upload';
import { loadRecordingBlob, clearRecordingBlob } from '@/lib/recordingStore';
import LoomPlayer from '@/components/LoomPlayer';

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

const fmtDuration = (secs) => {
    if (!secs || !Number.isFinite(secs)) return null;
    const s = Math.max(0, Math.floor(secs));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
};

const fmtSize = (bytes) => {
    if (!bytes || Number.isNaN(bytes)) return null;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Loom-style post-record screen: preview, name, save (share link), download, discard.
 */
const RecordingEditorPage = () => {
    const navigate = useNavigate();
    const [blob, setBlob] = useState(null);
    const [videoUrl, setVideoUrl] = useState('');
    const [duration, setDuration] = useState(null);
    const [saving, setSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [shareLink, setShareLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [title, setTitle] = useState(defaultTitle());
    const [uploadRef, setUploadRef] = useState(null);
    const [looking, setLooking] = useState(true);

    useEffect(() => {
        let cancelled = false;
        let poll = null;
        let objectUrl = null;

        const setFromBlob = (b) => {
            if (cancelled || !b) return;
            setBlob(b);
            try {
                objectUrl = URL.createObjectURL(b);
                setVideoUrl(objectUrl);
            } catch { /* noop */ }
            setLooking(false);
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
            if (tryOpenerBlob()) return;
            const url = sessionStorage.getItem('tsk_last_recording_url');
            if (url && !cancelled) {
                setVideoUrl(url);
                setLooking(false);
            }
            let tries = 0;
            poll = setInterval(async () => {
                tries += 1;
                if (tryOpenerBlob()) { clearInterval(poll); return; }
                try {
                    const entry = await loadRecordingBlob();
                    if (entry?.blob && entry.blob.size > 0) { setFromBlob(entry.blob); clearInterval(poll); return; }
                } catch { /* silent */ }
                if (tries > 30) {
                    clearInterval(poll);
                    setLooking(false);
                }
            }, 400);
        })();

        return () => {
            cancelled = true;
            if (poll) clearInterval(poll);
            if (objectUrl) {
                try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ }
            }
        };
    }, []);

    const ensureUploaded = async () => {
        if (uploadRef) return uploadRef;
        if (!blob) throw new Error('No recording data available');
        const filename = `recording-${Date.now()}.webm`;
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
                title: title.trim() || defaultTitle(),
                duration_seconds: duration,
                size_bytes: blob?.size,
                mime_type: blob?.type,
            });
            setShareLink(res.data.shareable_link);
            toast.success('Recording saved');
            try { await clearRecordingBlob(); } catch { /* noop */ }
        } catch (e) {
            toast.error(e?.response?.data?.detail || e?.message || 'Failed to save recording');
        } finally { setSaving(false); }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareLink);
            setCopied(true);
            toast.success('Link copied');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Could not copy link');
        }
    };

    const downloadLocal = () => {
        if (!videoUrl) return;
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = `${(title || 'recording').replace(/[^\w\- ]+/g, '').trim() || 'recording'}.webm`;
        a.click();
    };

    const discard = async () => {
        if (shareLink) {
            navigate('/recordings');
            return;
        }
        if (!window.confirm('Discard this recording? It will not be saved.')) return;
        try { await clearRecordingBlob(); } catch { /* noop */ }
        try { delete window.__tskLastRecordingBlob; } catch { /* noop */ }
        try {
            sessionStorage.removeItem('tsk_last_recording_url');
            sessionStorage.removeItem('tsk_last_recording_type');
            sessionStorage.removeItem('tsk_last_recording_size');
        } catch { /* noop */ }
        try { if (window.opener) { window.close(); return; } } catch { /* noop */ }
        navigate('/recordings');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <header className="border-b border-white/10 sticky top-0 z-30 bg-slate-950/90 backdrop-blur">
                <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 max-w-5xl">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { try { if (window.opener) { window.close(); return; } } catch { /* noop */ } navigate('/recordings'); }}
                        className="rounded-full text-white hover:bg-white/10"
                        data-testid="recording-back-btn"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base sm:text-lg font-semibold flex items-center gap-2 truncate">
                            <Video className="w-4 h-4 text-rose-400 shrink-0" /> Preview &amp; save
                        </h1>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/recordings')} className="rounded-full text-white/80 hover:bg-white/10" data-testid="open-library-btn">
                        <Library className="w-4 h-4 mr-1" /> Library
                    </Button>
                </div>
            </header>

            <div className="container mx-auto px-4 sm:px-6 py-6 max-w-5xl">
                <div className="rounded-2xl overflow-hidden mb-5 border border-white/10 shadow-2xl">
                    {videoUrl ? (
                        <LoomPlayer
                            src={videoUrl}
                            autoPlay
                            onDuration={(d) => setDuration(d)}
                            videoClassName="max-h-[62vh]"
                            data-testid="recording-preview-video"
                        />
                    ) : (
                        <div className="p-12 text-center bg-black">
                            <div className="inline-flex items-center gap-2 mb-3">
                                <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
                                <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" style={{ animationDelay: '300ms' }} />
                            </div>
                            <p className="text-sm text-white/80">{looking ? 'Looking for your recording…' : 'No recording found.'}</p>
                            <p className="text-xs text-white/50 mt-1">If nothing appears, go back and record again.</p>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-white/50 mb-4">
                    {fmtDuration(duration) && <span>Duration {fmtDuration(duration)}</span>}
                    {fmtSize(blob?.size) && <span>· {fmtSize(blob.size)}</span>}
                    {blob?.type && <span>· {blob.type.replace('video/', '').toUpperCase()}</span>}
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-5">
                    <div>
                        <label className="text-xs font-medium text-white/60 uppercase tracking-wider block mb-1.5">Title</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Give this recording a name"
                            className="rounded-xl bg-white text-slate-900 border-0 h-11"
                            data-testid="recording-title-input"
                            disabled={!!shareLink}
                        />
                    </div>

                    {!shareLink ? (
                        <div className="space-y-3">
                            <p className="text-sm text-white/70">
                                Save to your library and get a shareable link anyone can watch — no login required.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    onClick={saveAndShare}
                                    disabled={saving || !blob}
                                    className="rounded-full h-11 px-6 bg-rose-500 hover:bg-rose-600 text-white"
                                    data-testid="save-share-btn"
                                >
                                    <Link2 className="w-4 h-4 mr-2" />
                                    {saving ? `Uploading ${uploadProgress}%…` : 'Save & get link'}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={downloadLocal}
                                    disabled={!videoUrl}
                                    className="rounded-full h-11 px-5 bg-transparent border-white/20 text-white hover:bg-white/10"
                                    data-testid="download-recording-btn"
                                >
                                    <Download className="w-4 h-4 mr-2" /> Download
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={discard}
                                    className="rounded-full h-11 px-4 text-white/60 hover:text-white hover:bg-white/10 ml-auto"
                                    data-testid="discard-recording-btn"
                                >
                                    <Trash2 className="w-4 h-4 mr-1" /> Discard
                                </Button>
                            </div>
                            {saving && (
                                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-rose-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4" data-testid="share-success-panel">
                            <div className="flex items-center gap-2 text-sm text-emerald-300 font-medium">
                                <Check className="w-4 h-4" /> Saved. Anyone with this link can watch your recording.
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <input
                                    value={shareLink}
                                    readOnly
                                    className="flex-1 border border-white/15 rounded-xl px-3 py-2.5 text-sm bg-black/40 font-mono text-white"
                                    data-testid="share-link-input"
                                />
                                <Button onClick={copyLink} className="rounded-full bg-white text-slate-900 hover:bg-slate-100" data-testid="copy-share-btn">
                                    {copied ? <><Check className="w-4 h-4 mr-1" /> Copied</> : <><Copy className="w-4 h-4 mr-1" /> Copy link</>}
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={downloadLocal} disabled={!videoUrl} className="rounded-full bg-transparent border-white/20 text-white hover:bg-white/10">
                                    <Download className="w-4 h-4 mr-1" /> Download
                                </Button>
                                <Button variant="outline" onClick={() => navigate('/recordings')} className="rounded-full bg-transparent border-white/20 text-white hover:bg-white/10">
                                    <Library className="w-4 h-4 mr-1" /> Go to library
                                </Button>
                                <a
                                    href={shareLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center h-9 px-4 rounded-full border border-white/20 text-sm hover:bg-white/10"
                                >
                                    Open share page
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RecordingEditorPage;
