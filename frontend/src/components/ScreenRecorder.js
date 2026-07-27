import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Video, Square, Pause, Play, RotateCcw, Mic, MicOff, Camera, CameraOff, AlertCircle, Move } from 'lucide-react';
import { toast } from 'sonner';

// Draggable floating control bar rendered as a fixed overlay (top-most z-index).
const FloatingBar = ({ children, storageKey = 'tsk_rec_bar_pos' }) => {
    const [pos, setPos] = useState(() => {
        try { return JSON.parse(localStorage.getItem(storageKey) || 'null') || { x: 24, y: window.innerHeight - 96 }; }
        catch { return { x: 24, y: window.innerHeight - 96 }; }
    });
    const start = useRef(null);
    const posRef = useRef(pos);
    posRef.current = pos;

    const onDown = (e) => {
        const evt = e.touches ? e.touches[0] : e;
        start.current = { x: evt.clientX - posRef.current.x, y: evt.clientY - posRef.current.y };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    };
    const onMove = (e) => {
        if (!start.current) return;
        if (e.cancelable) e.preventDefault?.();
        const evt = e.touches ? e.touches[0] : e;
        const next = {
            x: Math.max(4, Math.min(window.innerWidth - 340, evt.clientX - start.current.x)),
            y: Math.max(4, Math.min(window.innerHeight - 80, evt.clientY - start.current.y)),
        };
        setPos(next);
    };
    const onUp = () => {
        try { localStorage.setItem(storageKey, JSON.stringify(posRef.current)); } catch { /* noop */ }
        start.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
    };

    return (
        <div style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 2147483647 }}
            className="bg-red-600 text-white rounded-2xl shadow-2xl flex items-center gap-2 px-3 py-2 select-none">
            <div className="cursor-grab active:cursor-grabbing p-1" onMouseDown={onDown} onTouchStart={onDown} title="Drag">
                <Move className="w-4 h-4 opacity-80" />
            </div>
            {children}
        </div>
    );
};

const WebcamBubble = ({ stream, mirrored = true }) => {
    const videoRef = useRef(null);
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !stream) return;
        v.srcObject = stream;
        // Kick playback (autoplay is muted so browser allows it)
        const play = () => v.play().catch(() => {});
        v.onloadedmetadata = play;
        play();
    }, [stream]);
    return (
        <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 2147483646 }}
            className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-2xl bg-black">
            <video
                ref={videoRef}
                autoPlay muted playsInline
                style={{ transform: mirrored ? 'scaleX(-1)' : 'none', width: '100%', height: '100%', objectFit: 'cover' }}
            />
        </div>
    );
};

/**
 * Robust screen recorder:
 *  - Requests webcam + mic FIRST (so the getDisplayMedia dialog isn't the only prompt)
 *  - Does NOT set preferCurrentTab (some browsers use it to force tab selection)
 *  - Lets the user freely pick monitor / window / tab in the browser picker
 *  - Falls back gracefully if webcam or mic fail
 */
export const ScreenRecorder = ({ onSaved }) => {
    const [starting, setStarting] = useState(false);
    const [recording, setRecording] = useState(false);
    const [paused, setPaused] = useState(false);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [seconds, setSeconds] = useState(0);
    const [displaySurface, setDisplaySurface] = useState(null);
    const [camStream, setCamStream] = useState(null);

    const displayStreamRef = useRef(null);
    const micStreamRef = useRef(null);
    const camStreamRef = useRef(null);
    const mixedStreamRef = useRef(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const mimeTypeRef = useRef('video/webm');

    const stopAllTracks = () => {
        [displayStreamRef, micStreamRef, camStreamRef, mixedStreamRef].forEach((r) => {
            try { r.current?.getTracks?.().forEach((t) => t.stop()); } catch { /* noop */ }
            r.current = null;
        });
        setCamStream(null);
    };

    const start = async () => {
        setStarting(true);
        let micErr = null;
        let camErr = null;
        try {
            // 1) Ask for webcam + mic FIRST so the small bubble is ready before the screen picker
            if (camOn) {
                try {
                    const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320, facingMode: 'user' } });
                    camStreamRef.current = cam;
                    setCamStream(cam);
                } catch (e) { camErr = e; }
            }
            if (micOn) {
                try {
                    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
                    micStreamRef.current = mic;
                } catch (e) { micErr = e; }
            }

            // 2) Screen picker (native dialog offers Screen / Window / Chrome Tab tabs)
            const display = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30, cursor: 'always' },
                audio: true,
                // Do NOT set preferCurrentTab — that forces the picker to only offer current tab in some browsers.
                selfBrowserSurface: 'include',
                surfaceSwitching: 'include',
                systemAudio: 'include',
            });
            displayStreamRef.current = display;
            const settings = display.getVideoTracks()[0]?.getSettings?.() || {};
            setDisplaySurface(settings.displaySurface || null);

            // 3) Build the mixed recording stream (video from display + audio from tab + mic if enabled)
            const audioTracks = [
                ...(display.getAudioTracks() || []),
                ...((micStreamRef.current && micOn && micStreamRef.current.getAudioTracks()) || []),
            ];
            const mixed = new MediaStream([...display.getVideoTracks(), ...audioTracks]);
            mixedStreamRef.current = mixed;

            const preferred = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
            const mimeType = preferred.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
            mimeTypeRef.current = mimeType || 'video/webm';
            const rec = new MediaRecorder(mixed, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_500_000 });
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
            rec.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                setRecording(false);
                setPaused(false);
                setSeconds(0);
                const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'video/webm' });
                stopAllTracks();
                if (blob.size === 0) { toast.error('Recording was empty'); return; }
                const url = URL.createObjectURL(blob);
                try { sessionStorage.setItem('tsk_last_recording_url', url); } catch { /* noop */ }
                try { sessionStorage.setItem('tsk_last_recording_type', blob.type); } catch { /* noop */ }
                window.__tskLastRecordingBlob = blob;
                if (onSaved) onSaved(blob, url);
                window.open('/recording/edit', '_blank', 'noopener');
            };
            recorderRef.current = rec;
            display.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
            });
            rec.start(1000);
            setRecording(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

            const surf = settings.displaySurface;
            if (surf === 'monitor') toast.info('Recording your whole screen.');
            else if (surf === 'browser') toast.info('Recording this browser tab.');
            else if (surf === 'window') toast.info('Recording a window — use the browser Stop Sharing bar to end.');

            if (camErr) toast.warning('Webcam not available — continuing without it.');
            if (micErr) toast.warning('Mic not available — continuing without audio commentary.');
        } catch (e) {
            if (e?.name !== 'NotAllowedError') toast.error(e?.message || 'Could not start recording');
            stopAllTracks();
        } finally { setStarting(false); }
    };

    const stop = () => {
        try { if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop(); }
        catch { stopAllTracks(); }
    };

    const pauseResume = () => {
        const rec = recorderRef.current;
        if (!rec) return;
        if (rec.state === 'recording') { rec.pause(); setPaused(true); }
        else if (rec.state === 'paused') { rec.resume(); setPaused(false); }
    };

    const restart = () => {
        try { if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop(); } catch { /* noop */ }
        chunksRef.current = [];
        setTimeout(() => { start(); }, 400);
    };

    const toggleMic = () => {
        setMicOn((v) => {
            const on = !v;
            micStreamRef.current?.getAudioTracks?.().forEach((t) => (t.enabled = on));
            return on;
        });
    };
    const toggleCam = () => {
        setCamOn((v) => {
            const on = !v;
            camStreamRef.current?.getVideoTracks?.().forEach((t) => (t.enabled = on));
            return on;
        });
    };

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    return (
        <>
            {!recording && (
                <Button variant="outline" onClick={start} disabled={starting} className="rounded-full" size="sm" data-testid="start-recording-btn">
                    <Video className="w-4 h-4 mr-2" /> {starting ? 'Starting...' : 'Record Screen'}
                </Button>
            )}

            {recording && (
                <FloatingBar>
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                    <span className="font-mono font-bold text-base" data-testid="recording-timer">{fmt(seconds)}</span>
                    <button onClick={pauseResume} title={paused ? 'Resume' : 'Pause'} className="p-1.5 rounded-full hover:bg-white/20">
                        {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </button>
                    <button onClick={restart} title="Restart" className="p-1.5 rounded-full hover:bg-white/20">
                        <RotateCcw className="w-4 h-4" />
                    </button>
                    <button onClick={toggleMic} title={micOn ? 'Mute mic' : 'Unmute mic'} className="p-1.5 rounded-full hover:bg-white/20">
                        {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 opacity-60" />}
                    </button>
                    <button onClick={toggleCam} title={camOn ? 'Hide webcam' : 'Show webcam'} className="p-1.5 rounded-full hover:bg-white/20">
                        {camOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4 opacity-60" />}
                    </button>
                    <Button size="sm" onClick={stop} className="bg-white text-red-600 hover:bg-gray-100 rounded-full ml-2" data-testid="stop-recording-btn">
                        <Square className="w-4 h-4 mr-1" /> Stop
                    </Button>
                </FloatingBar>
            )}

            {recording && camOn && camStream && <WebcamBubble stream={camStream} />}

            {recording && displaySurface === 'window' && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2147483645 }}
                    className="max-w-xs bg-white border border-amber-300 shadow-xl rounded-2xl p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>You&apos;re recording a separate window &mdash; controls won&apos;t appear there. Come back to this tab or use the browser Stop Sharing bar.</span>
                </div>
            )}
        </>
    );
};

export default ScreenRecorder;
