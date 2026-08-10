import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { publicRecordingStreamUrl } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Video, AlertCircle, Clock, ArrowLeft } from 'lucide-react';

/**
 * Public share page for a standalone recording.
 * Anyone with the link can view — no login required.
 * Streams via GET /api/recordings/{token}/stream (no JWT).
 */
const RecordingSharePage = () => {
    const { token } = useParams();
    const [recording, setRecording] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await axios.get(`${API}/recordings/${encodeURIComponent(token)}`);
                if (cancelled) return;
                if (res.data?.expired) {
                    setError(res.data.message || 'This recording has expired and was deleted.');
                    setRecording(null);
                } else {
                    setRecording(res.data);
                }
            } catch (e) {
                if (cancelled) return;
                const status = e?.response?.status;
                if (status === 404) setError('Recording not found. The link may be invalid or the recording was deleted.');
                else setError(e?.response?.data?.detail || e?.message || 'Could not load recording.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    const fmtDuration = (secs) => {
        if (secs == null || Number.isNaN(Number(secs))) return null;
        const s = Math.max(0, Math.floor(Number(secs)));
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    };

    const streamUrl = token ? publicRecordingStreamUrl(token) : '';

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col">
            <header className="border-b border-white/10 px-4 py-3 flex items-center gap-3">
                <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white">
                    <ArrowLeft className="w-4 h-4" /> Tskflow
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-sm font-semibold truncate flex items-center gap-2">
                        <Video className="w-4 h-4 text-teal-400 shrink-0" />
                        {recording?.title || 'Shared recording'}
                    </h1>
                </div>
                {recording?.duration_seconds != null && (
                    <span className="text-xs text-white/60 inline-flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" /> {fmtDuration(recording.duration_seconds)}
                    </span>
                )}
            </header>

            <main className="flex-1 flex items-center justify-center p-4">
                {loading && (
                    <div className="text-center text-white/70 text-sm">
                        <div className="w-8 h-8 border-2 border-white/30 border-t-teal-400 rounded-full animate-spin mx-auto mb-3" />
                        Loading recording…
                    </div>
                )}

                {!loading && error && (
                    <div className="max-w-md text-center space-y-3">
                        <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
                        <h2 className="text-lg font-semibold">Unavailable</h2>
                        <p className="text-sm text-white/70">{error}</p>
                        <Button asChild variant="outline" className="rounded-full bg-transparent text-white border-white/30 hover:bg-white/10">
                            <Link to="/">Go to Tskflow</Link>
                        </Button>
                    </div>
                )}

                {!loading && !error && recording && (
                    <div className="w-full max-w-5xl">
                        <div className="bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                            {streamUrl ? (
                                <video
                                    key={streamUrl}
                                    src={streamUrl}
                                    controls
                                    playsInline
                                    className="w-full max-h-[80vh] bg-black"
                                    data-testid="shared-recording-video"
                                >
                                    Your browser does not support video playback.
                                </video>
                            ) : (
                                <div className="aspect-video flex items-center justify-center text-white/60 text-sm">
                                    No video available for this recording.
                                </div>
                            )}
                        </div>
                        {recording.description && (
                            <p className="mt-4 text-sm text-white/70 whitespace-pre-wrap">{recording.description}</p>
                        )}
                        <p className="mt-3 text-xs text-white/40">
                            Shared via Tskflow · Recordings may be auto-deleted 24 hours after an associated task is completed.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default RecordingSharePage;
