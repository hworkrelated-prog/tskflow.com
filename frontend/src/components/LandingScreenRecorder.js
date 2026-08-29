import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Square, Check } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecordingBlob } from '@/lib/recordingStore';
import { canCaptureDisplay, pickRecorderMime } from '@/lib/recordingCapabilities';
import { trackRecordingStart, trackLandingInteract } from '@/lib/productAnalytics';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Landing-page screen recorder: no account needed. The blob stays local until the
 * visitor sends the ask, then it rides along and the robot delivers it with the task.
 */
export const LandingScreenRecorder = ({ onRecorded, recorded, prominent = false }) => {
    const [recording, setRecording] = useState(false);
    const [starting, setStarting] = useState(false);
    const [seconds, setSeconds] = useState(0);

    const streamRef = useRef(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    const cleanup = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        try { streamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch { /* noop */ }
        streamRef.current = null;
    };

    useEffect(() => cleanup, []);

    const start = async () => {
        if (!canCaptureDisplay()) {
            toast.info('Screen recording needs a desktop browser. Send the ask and record later.');
            return;
        }
        setStarting(true);
        try {
            const display = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: true,
            });
            streamRef.current = display;
            const mimeType = pickRecorderMime();
            const rec = mimeType ? new MediaRecorder(display, { mimeType }) : new MediaRecorder(display);
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
            rec.onstop = async () => {
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
                setRecording(false);
                setSeconds(0);
                const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || 'video/webm' });
                chunksRef.current = [];
                cleanup();
                if (!blob.size) {
                    toast.error('Recording was empty');
                    return;
                }
                try { await saveRecordingBlob(blob, { type: blob.type, size: blob.size }); } catch { /* noop */ }
                onRecorded?.(blob);
                toast.success('Walkthrough saved here. Send the ask and it goes with it.');
            };
            recorderRef.current = rec;
            display.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
            });
            rec.start(1000);
            setRecording(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
            trackLandingInteract('recording');
            trackRecordingStart({ surface: 'landing' });
        } catch (e) {
            cleanup();
            if (e?.name !== 'NotAllowedError') toast.error('Could not start recording');
        } finally {
            setStarting(false);
        }
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

    if (recording) {
        return (
            <Button
                type="button"
                variant="outline"
                onClick={stop}
                className={recClass}
                data-testid="landing-record-stop"
            >
                <Square className="w-3.5 h-3.5 mr-2 fill-current" /> Stop {fmt(seconds)}
            </Button>
        );
    }

    return (
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
    );
};

export default LandingScreenRecorder;
