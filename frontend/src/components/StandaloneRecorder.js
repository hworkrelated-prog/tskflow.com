import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Video, Square, Copy, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBlob } from '@/lib/upload';
import axios from 'axios';
import { API } from '@/App';

export const StandaloneRecorder = () => {
    const [recording, setRecording] = useState(false);
    const [starting, setStarting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [showResult, setShowResult] = useState(false);
    const [shareableLink, setShareableLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [displaySurface, setDisplaySurface] = useState(null); // 'monitor' | 'window' | 'browser'

    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    const startRecording = async () => {
        setStarting(true);
        try {
            // Prefer robust picker: let the user freely pick tab/window/screen
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: true,
                selfBrowserSurface: 'include',
                surfaceSwitching: 'include',
                systemAudio: 'include',
            });
            streamRef.current = stream;

            // Detect what the user picked so we can guide them accordingly
            try {
                const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
                setDisplaySurface(settings.displaySurface || null);
            } catch (_) { /* noop */ }

            // Pick a widely supported mimeType (Safari/older Chrome may lack vp9)
            const preferred = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm',
            ];
            const mimeType = preferred.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
            const recorder = new MediaRecorder(stream, {
                ...(mimeType ? { mimeType } : {}),
                videoBitsPerSecond: 2_500_000,
            });
            recorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                setRecording(false);
                setSeconds(0);
                setSaving(true);

                const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
                if (blob.size > 0) {
                    try {
                        const filename = `recording-${Date.now()}.webm`;
                        const ref = await uploadBlob(blob, filename, blob.type || 'video/webm');
                        const response = await axios.post(`${API}/recordings/standalone`, {
                            recording_url: ref.storage_path || ref.path,
                        });
                        setShareableLink(response.data.shareable_link);
                        setShowResult(true);
                        toast.success('Recording saved!');
                    } catch (err) {
                        console.error('Upload error:', err);
                        toast.error(err?.response?.data?.detail || 'Failed to save recording');
                    }
                } else {
                    toast.error('Recording was empty - nothing to save');
                }

                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((t) => t.stop());
                }
                setSaving(false);
            };

            // If user clicks the browser's built-in "Stop sharing" bar, gracefully stop
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
            });

            // Emit a chunk every second so we always have data even on quick stops
            recorder.start(1000);
            setRecording(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

            // Helpful hint based on the picked surface
            const surf = stream.getVideoTracks()[0]?.getSettings?.().displaySurface;
            if (surf === 'monitor') {
                toast.info('Recording your whole screen - floating controls will be visible.');
            } else if (surf === 'browser') {
                toast.info('Recording this tab - the on-screen Stop button will be visible.');
            } else if (surf === 'window') {
                toast.info('Recording a window - use browser\'s "Stop sharing" bar to end.');
            }
        } catch (e) {
            if (e?.name !== 'NotAllowedError') {
                toast.error('Could not start recording');
            }
        } finally {
            setStarting(false);
        }
    };

    const stopRecording = () => {
        if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
    };

    const copyLink = () => {
        navigator.clipboard.writeText(shareableLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Link copied!');
    };

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    return (
        <>
            {!recording && !saving && (
                <Button
                    variant="outline"
                    onClick={startRecording}
                    disabled={starting}
                    className="rounded-full"
                    size="sm"
                >
                    <Video className="w-4 h-4 mr-2" />
                    {starting ? 'Starting...' : 'Record Screen'}
                </Button>
            )}

            {saving && (
                <Button variant="outline" disabled className="rounded-full" size="sm">
                    <Video className="w-4 h-4 mr-2 animate-pulse" /> Saving...
                </Button>
            )}

            {/* Floating controls - visible on the recorded surface when the user records the current tab or full screen */}
            {recording && (
                <div className="fixed bottom-6 right-6 z-[9999] bg-red-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 select-none">
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                    <span className="font-mono font-bold text-lg" data-testid="recording-timer">{fmt(seconds)}</span>
                    <Button
                        size="sm"
                        onClick={stopRecording}
                        className="bg-white text-red-600 hover:bg-gray-100 rounded-full ml-2"
                        data-testid="stop-recording-btn"
                    >
                        <Square className="w-4 h-4 mr-1" />
                        Stop
                    </Button>
                </div>
            )}

            {recording && displaySurface === 'window' && (
                <div className="fixed bottom-24 right-6 z-[9998] max-w-xs bg-white border border-amber-300 shadow-xl rounded-2xl p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        You&apos;re recording a separate window &mdash; this control panel won&apos;t appear inside that window.
                        Come back to this tab or use the browser&apos;s &quot;Stop sharing&quot; bar to end.
                    </span>
                </div>
            )}

            <Dialog open={showResult} onOpenChange={setShowResult}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Recording Ready</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <input
                                type="text"
                                value={shareableLink}
                                readOnly
                                className="flex-1 bg-transparent border-none outline-none text-sm"
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={copyLink}
                                className="shrink-0"
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Share link
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default StandaloneRecorder;
