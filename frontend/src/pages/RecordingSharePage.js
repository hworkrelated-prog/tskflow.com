import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { API } from '@/App';
import { Video, Clock, AlertCircle } from 'lucide-react';
import LoomPlayer from '@/components/LoomPlayer';

const fmtDuration = (secs) => {
    if (!secs || Number.isNaN(secs)) return null;
    const s = Math.max(0, Math.floor(secs));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
};

/**
 * Public Loom-style watch page for a shareable recording token.
 */
const RecordingSharePage = () => {
    const { token } = useParams();
    const [rec, setRec] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [playedDuration, setPlayedDuration] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await axios.get(`${API}/recordings/${token}`);
                if (cancelled) return;
                if (res.data?.expired) {
                    setError(res.data.message || 'This recording has expired.');
                    setRec(null);
                } else {
                    setRec(res.data);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(e?.response?.data?.detail || 'Recording not found');
                    setRec(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    const mediaUrl = token ? `${API}/recordings/${token}/media` : '';
    const shownDuration = playedDuration || rec?.duration_seconds;

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col">
            <header className="border-b border-white/10">
                <div className="container mx-auto px-4 sm:px-6 py-4 max-w-5xl flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center">
                        <Video className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs uppercase tracking-wider text-white/40">Recording</p>
                        <h1 className="font-semibold truncate" data-testid="share-page-title">
                            {rec?.title || (loading ? 'Loading…' : 'Recording')}
                        </h1>
                    </div>
                    {fmtDuration(shownDuration) && (
                        <span className="text-xs text-white/50 inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {fmtDuration(shownDuration)}
                        </span>
                    )}
                </div>
            </header>

            <main className="flex-1 container mx-auto px-4 sm:px-6 py-6 max-w-5xl">
                {loading && (
                    <div className="aspect-video bg-black/50 rounded-2xl border border-white/10 flex items-center justify-center text-white/60 text-sm">
                        Loading recording…
                    </div>
                )}
                {!loading && error && (
                    <div className="aspect-video bg-black/50 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-2 text-center px-6" data-testid="share-page-error">
                        <AlertCircle className="w-8 h-8 text-amber-400" />
                        <p className="text-sm text-white/80">{error}</p>
                        <Link to="/" className="text-xs text-rose-300 hover:text-rose-200 underline underline-offset-2 mt-2">Go to TskFlow</Link>
                    </div>
                )}
                {!loading && rec && !error && (
                    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                        <LoomPlayer
                            src={mediaUrl}
                            autoPlay
                            onDuration={setPlayedDuration}
                            videoClassName="max-h-[75vh]"
                            data-testid="share-page-video"
                        />
                    </div>
                )}
                {rec?.description && (
                    <p className="mt-4 text-sm text-white/60 whitespace-pre-wrap">{rec.description}</p>
                )}
            </main>
        </div>
    );
};

export default RecordingSharePage;
