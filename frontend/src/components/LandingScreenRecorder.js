import React, { useEffect, useRef, useState } from 'react';
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
export const LandingScreenRecorder = ({ onRecorded, recorded, prominent = false }) => {
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
        toast.success('Walkthrough saved here. Send the ask and it goes with it.');
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

    const recClass = prominent
        ? 'rounded-full border-red-400/45 bg-red-500/15 text-white hover:bg-red-500/25 h-11 px-5 font-medium'
        : 'rounded-full border-red-400/50 bg-red-500/10 text-red-200 hover:bg-red-500/20 h-10';
    const idleClass = prominent
        ? 'rounded-full border-white/20 bg-white/[0.06] text-white hover:bg-white/12 h-11 px-5 font-medium'
        : 'rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 h-10';

    return (
        <>
            {recording ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={stop}
                    className={recClass}
                    data-testid="landing-record-stop"
                >
                    <Square className="w-3.5 h-3.5 mr-2 fill-current" /> Stop {fmt(seconds)}
                </Button>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    onClick={start}
                    disabled={starting}
                    className={idleClass}
                    data-testid="landing-record-screen"
                >
                    {recorded ? <Check className="w-4 h-4 mr-2 text-teal-300" /> : (
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2.5 ring-2 ring-red-500/30" aria-hidden />
                    )}
                    {recorded ? 'Walkthrough ready' : starting ? 'Starting…' : prominent ? 'Record' : 'Record screen'}
                </Button>
            )}

            {cameraPreview && recording && (
                <div
                    className="landing-camera-preview fixed inset-0 z-[80] bg-black flex flex-col"
                    data-testid="landing-camera-preview"
                >
                    <video
                        ref={previewRef}
                        autoPlay
                        muted
                        playsInline
                        className="flex-1 w-full object-cover bg-black"
                    />
                    <div className="shrink-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center bg-black/80">
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
                </div>
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
