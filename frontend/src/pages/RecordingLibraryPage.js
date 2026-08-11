import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Video, Copy, Trash2, Share2, ExternalLink, Clock, Play } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import ScreenRecorder from '@/components/ScreenRecorder';
import LoomPlayer from '@/components/LoomPlayer';

const fmtDuration = (secs) => {
    if (!secs || Number.isNaN(secs)) return null;
    const s = Math.max(0, Math.floor(secs));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
};

const fmtSize = (bytes) => {
    if (!bytes || Number.isNaN(bytes)) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const RecordingLibraryPage = () => {
    const navigate = useNavigate();
    const [recordings, setRecordings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [preview, setPreview] = useState(null);
    const [deleting, setDeleting] = useState(null);

    const fetchRecordings = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API}/recordings/mine`);
            setRecordings(res.data.recordings || []);
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Failed to load recordings');
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchRecordings(); }, []);

    const copyLink = (link) => {
        try {
            navigator.clipboard.writeText(link);
            toast.success('Share link copied');
        } catch { toast.error('Copy failed'); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this recording? This cannot be undone.')) return;
        setDeleting(id);
        try {
            await axios.delete(`${API}/recordings/${id}`);
            setRecordings((prev) => prev.filter((r) => r.id !== id));
            toast.success('Recording deleted');
            if (preview?.id === id) setPreview(null);
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Failed to delete');
        } finally { setDeleting(null); }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b sticky top-0 z-30">
                <div className="container mx-auto px-6 py-4 flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="rounded-full" data-testid="library-back-btn">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold flex items-center gap-2">
                            <Video className="w-5 h-5 text-teal-600" /> Recordings
                        </h1>
                        <p className="text-xs text-muted-foreground">All your screen recordings — start a new one or browse past recordings.</p>
                    </div>
                    <ScreenRecorder />
                    <span className="text-xs text-muted-foreground hidden md:inline">{recordings.length} recording{recordings.length === 1 ? '' : 's'}</span>
                </div>
            </header>

            <main className="container mx-auto px-6 py-6 max-w-6xl">
                {loading ? (
                    <div className="py-16 text-center text-muted-foreground">Loading recordings...</div>
                ) : recordings.length === 0 ? (
                    <Card className="border-2 border-dashed rounded-2xl">
                        <CardContent className="py-16 text-center">
                            <Video className="w-10 h-10 text-teal-400 mx-auto mb-3" />
                            <h3 className="text-lg font-semibold mb-1">No recordings yet</h3>
                            <p className="text-sm text-muted-foreground mb-4">Hit the &quot;Record Screen&quot; button above to create your first one.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recordings.map((r) => (
                            <Card key={r.id} className="border-2 rounded-2xl overflow-hidden hover:shadow-md transition-shadow" data-testid={`library-recording-${r.id}`}>
                                <button type="button" onClick={() => setPreview(r)} className="w-full aspect-video bg-gray-900 relative group">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Play className="w-6 h-6 text-teal-600 ml-1" />
                                        </div>
                                    </div>
                                    {r.duration_seconds && (
                                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {fmtDuration(r.duration_seconds)}
                                        </div>
                                    )}
                                </button>
                                <CardContent className="p-3 space-y-2">
                                    <h3 className="font-semibold text-sm line-clamp-1">{r.title}</h3>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                        <span>{r.created_at ? format(parseISO(r.created_at), 'MMM d, h:mm a') : ''}</span>
                                        {fmtSize(r.size_bytes) && <span>· {fmtSize(r.size_bytes)}</span>}
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {r.shareable_link && (
                                            <Button size="sm" variant="outline" onClick={() => copyLink(r.shareable_link)} className="rounded-full h-7 px-2.5 text-xs" data-testid={`library-copy-${r.id}`}>
                                                <Copy className="w-3 h-3 mr-1" /> Copy link
                                            </Button>
                                        )}
                                        {r.shareable_link && (
                                            <a href={r.shareable_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-7 px-2.5 text-xs rounded-full border hover:bg-gray-50">
                                                <ExternalLink className="w-3 h-3" /> Open
                                            </a>
                                        )}
                                        <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="rounded-full h-7 px-2.5 text-xs text-red-600 hover:bg-red-50 ml-auto" data-testid={`library-delete-${r.id}`}>
                                            <Trash2 className="w-3 h-3 mr-1" /> {deleting === r.id ? 'Deleting...' : 'Delete'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>

            {preview && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
                    <div className="bg-white rounded-2xl overflow-hidden max-w-4xl w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-5 py-3 flex items-center justify-between border-b">
                            <h3 className="font-semibold text-sm line-clamp-1">{preview.title}</h3>
                            <Button size="sm" variant="ghost" onClick={() => setPreview(null)} className="rounded-full">Close</Button>
                        </div>
                        <div className="bg-black">
                            {preview.shareable_token ? (
                                <LoomPlayer
                                    src={`${API}/recordings/${preview.shareable_token}/media`}
                                    autoPlay
                                    videoClassName="aspect-video"
                                    data-testid="library-preview-video"
                                />
                            ) : (
                                <div className="w-full aspect-video flex items-center justify-center text-white text-sm">No preview available</div>
                            )}
                        </div>
                        <div className="px-5 py-3 flex gap-2 flex-wrap border-t">
                            {preview.shareable_link && (
                                <>
                                    <Button size="sm" variant="outline" onClick={() => copyLink(preview.shareable_link)} className="rounded-full"><Copy className="w-4 h-4 mr-1" /> Copy link</Button>
                                    <a href={preview.shareable_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-9 px-3 text-sm rounded-full border hover:bg-gray-50"><Share2 className="w-4 h-4" /> Open shareable page</a>
                                </>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(preview.id)} disabled={deleting === preview.id} className="rounded-full ml-auto text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecordingLibraryPage;
