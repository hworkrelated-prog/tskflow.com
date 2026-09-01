import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Square, Check } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecordingBlob } from '@/lib/recordingStore';
import { canRecordWithCamera, needsIosScreenRecordFlow, pickRecorderMime } from '@/lib/recordingCapabilities';
import { trackRecordingStart, trackLandingInteract } from '@/lib/productAnalytics';
import LandingPhoneRecordSheet from '@/components/LandingPhoneRecordSheet';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Landing-page recorder: no account needed. Desktop uses getDisplayMedia.
 * Phones (no display capture) get camera / Photos / native Camera instead.
 * The blob stays local until the visitor sends the ask.
 */
export const LandingScreenRecorder = ({ onRecorded, recorded }) => {
    const [recording, setRecording] = useState(false);
    const [starting, setStarting] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [cameraPreview, setCameraPreview] = useState(false);

    const streamRef = useRef(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const previewRef = useRef(null);

    const stopTracks = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch { /* noop */ }
        streamRef.current = null;
        if (previewRef.current) previewRef.current.srcObject = null;
    };

    const cleanup = () => {
        stopTracks();
        setCameraPreview(false);
    };

    useEffect(() => () => stopTracks(), []);

    useEffect(() => {
        const el = previewRef.current;
        if (!el || !streamRef.current || !cameraPreview) return;
        el.srcObject = streamRef.current;
        el.play?.().catch(() => {});
    }, [cameraPreview, recording]);

    const finishBlob = async (blob) => {
        if (!blob?.size) {
            toast.error('Recording was empty');
            return;
        }
        try { await saveRecordingBlob(blob, { type: blob.type, size: blob.size }); } catch { /* noop */ }
        onRecorded?.(blob);
        toast.success('Saved');
    };

    const beginRecorder = (stream, { mimeHint, source, showPreview = false } = {}) => {
        const mimeType = pickRecorderMime();
        const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
        rec.onstop = async () => {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            setRecording(false);
            setSeconds(0);
            const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || mimeHint || 'video/webm' });
            chunksRef.current = [];
            cleanup();
            await finishBlob(blob);
        };
        recorderRef.current = rec;
        stream.getVideoTracks?.()[0]?.addEventListener('ended', () => {
            if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
        });
        rec.start(1000);
        setRecording(true);
        setSeconds(0);
        if (showPreview) setCameraPreview(true);
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        trackLandingInteract('recording');
        trackRecordingStart({ surface: 'landing', source: source || 'display' });
    };

    const startDisplay = async () => {
        setStarting(true);
        try {
            const display = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: true,
            });
            streamRef.current = display;
            beginRecorder(display, { mimeHint: 'video/webm', source: 'display' });
        } catch (e) {
            cleanup();
            if (e?.name === 'NotAllowedError') return;
            setSheetOpen(true);
        } finally {
            setStarting(false);
        }
    };

    const start = () => {
        if (needsIosScreenRecordFlow()) {
            setSheetOpen(true);
            return;
        }
        startDisplay();
    };

    const startCamera = async () => {
        if (!canRecordWithCamera()) {
            toast.info('Use the Camera app or pick a clip from Photos.');
            return;
        }
        setStarting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            streamRef.current = stream;
            setSheetOpen(false);
            beginRecorder(stream, { mimeHint: 'video/mp4', source: 'camera', showPreview: true });
        } catch (e) {
            cleanup();
            if (e?.name === 'NotAllowedError') {
                toast.error('Camera permission is needed, or attach a clip from Photos.');
            } else {
                toast.error('Could not start camera recording');
            }
            setSheetOpen(true);
        } finally {
            setStarting(false);
        }
    };

    const pickFile = async (file) => {
        if (!file) return;
        setSheetOpen(false);
        trackLandingInteract('recording');
        trackRecordingStart({ surface: 'landing', source: 'file' });
        await finishBlob(file);
    };

    const stop = () => {
        try { if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop(); }
        catch { cleanup(); }
    };

    const live = recording;
    const ready = recorded && !live;
    const label = live ? fmt(seconds) : ready ? 'Saved' : starting ? 'Starting' : 'Record';

    return (
        <>
            <button
                type="button"
                className={`landing-ask-rec landing-loom-rec${live ? ' is-live' : ''}${ready ? ' is-ready' : ''}${starting && !live ? ' is-starting' : ''}`}
                onClick={live ? stop : start}
                disabled={starting && !live}
                data-testid={live ? 'landing-record-stop' : 'landing-record-screen'}
                aria-label={live ? `Stop ${fmt(seconds)}` : ready ? 'Saved. Record again' : starting ? 'Starting' : 'Record'}
                title={live ? 'Stop' : ready ? 'Record again' : 'Record'}
                aria-pressed={live}
            >
                <span className="landing-loom-dot" aria-hidden>
                    {live ? <Square className="landing-ask-rec-stop" /> : ready ? <Check className="landing-ask-rec-check" /> : null}
                </span>
                <span className="landing-ask-rec-label">{label}</span>
            </button>

            {cameraPreview && recording && createPortal(
                <div
                    className="landing-camera-preview"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2147483000,
                        background: '#000',
                        overflow: 'hidden',
                        width: '100vw',
                        height: '100dvh',
                    }}
                    data-testid="landing-camera-preview"
                >
                    <video
                        ref={previewRef}
                        autoPlay
                        muted
                        playsInline
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 2,
                            padding: '1rem 1rem max(1.25rem, env(safe-area-inset-bottom))',
                            display: 'flex',
                            justifyContent: 'center',
                            background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
                        }}
                    >
                        <Button
                            type="button"
                            variant="outline"
                            onClick={stop}
                            className="rounded-full border-red-400/45 bg-red-500 text-white hover:bg-red-600 h-12 px-8"
                            data-testid="landing-camera-stop"
                        >
                            <Square className="w-3.5 h-3.5 mr-2 fill-current" /> Stop {fmt(seconds)}
                        </Button>
                    </div>
                </div>,
                document.body,
            )}

            <LandingPhoneRecordSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                onStartCamera={startCamera}
                onPickFile={pickFile}
                starting={starting}
            />
        </>
    );
};

export default LandingScreenRecorder;
