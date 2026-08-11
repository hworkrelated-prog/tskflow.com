import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Video, Square, Pause, Play, RotateCcw, Mic, MicOff, Camera, CameraOff, AlertCircle, Move } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecordingBlob } from '@/lib/recordingStore';

// Draggable floating control bar rendered as a fixed overlay (top-most z-index).
const FloatingBar = ({ children, storageKey = 'tsk_rec_bar_pos' }) => {
    const clampPos = (p) => {
        const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
        const h = typeof window !== 'undefined' ? window.innerHeight : 768;
        return {
            x: Math.max(12, Math.min(w - 380, p?.x ?? 24)),
            y: Math.max(12, Math.min(h - 96, p?.y ?? (h - 96))),
        };
    };
    const [pos, setPos] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            return clampPos(saved || { x: 24, y: (typeof window !== 'undefined' ? window.innerHeight : 768) - 96 });
        } catch {
            return clampPos({ x: 24, y: (typeof window !== 'undefined' ? window.innerHeight : 768) - 96 });
        }
    });
    useEffect(() => {
        const onResize = () => setPos((p) => clampPos(p));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
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
        const play = () => v.play().catch(() => {});
        v.onloadedmetadata = play;
        play();
    }, [stream]);
    return (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 2147483646 }}
            className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-2xl bg-black">
            <video
                ref={videoRef}
                autoPlay muted playsInline
                style={{ transform: mirrored ? 'scaleX(-1)' : 'none', width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div className="absolute bottom-1 left-1 right-1 flex justify-center pointer-events-none">
                <span className="text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded shadow">● REC</span>
            </div>
        </div>
    );
};

/**
 * Loom-style screen recorder:
 *  - Mic + camera first, then free screen/window/tab picker
 *  - Canvas composites screen + circular webcam bubble
 *  - Pause / restart / stop with floating or popup controls
 *  - Saves blob to IndexedDB and opens the preview/save editor
 */
export const ScreenRecorder = ({ onSaved }) => {
    const [starting, setStarting] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [recording, setRecording] = useState(false);
    const [paused, setPaused] = useState(false);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [seconds, setSeconds] = useState(0);
    const [displaySurface, setDisplaySurface] = useState(null);
    const [camStream, setCamStream] = useState(null);
    const [popupOpen, setPopupOpen] = useState(false);
    const controlsPopupRef = useRef(null);

    const displayStreamRef = useRef(null);
    const micStreamRef = useRef(null);
    const camStreamRef = useRef(null);
    const mixedStreamRef = useRef(null);
    const canvasStreamRef = useRef(null);
    const audioCtxRef = useRef(null);
    const rafRef = useRef(null);
    const screenVideoElRef = useRef(null);
    const camVideoElRef = useRef(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const mimeTypeRef = useRef('video/webm');
    const discardOnStopRef = useRef(false);
    const camOnRef = useRef(camOn);

    useEffect(() => { camOnRef.current = camOn; }, [camOn]);

    const stopAllTracks = () => {
        if (rafRef.current) { try { cancelAnimationFrame(rafRef.current); } catch { /* noop */ } rafRef.current = null; }
        try { audioCtxRef.current?.close?.(); } catch { /* noop */ }
        audioCtxRef.current = null;
        [displayStreamRef, micStreamRef, camStreamRef, mixedStreamRef, canvasStreamRef].forEach((r) => {
            try { r.current?.getTracks?.().forEach((t) => t.stop()); } catch { /* noop */ }
            r.current = null;
        });
        screenVideoElRef.current = null;
        camVideoElRef.current = null;
        setCamStream(null);
    };

    const mixAudioTracks = (displayStream, micStream, includeMic) => {
        const tabTracks = displayStream?.getAudioTracks?.() || [];
        const micTracks = (includeMic && micStream) ? (micStream.getAudioTracks() || []) : [];
        if (tabTracks.length === 0 && micTracks.length === 0) return [];
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) {
                return [...tabTracks, ...micTracks];
            }
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            const dest = ctx.createMediaStreamDestination();
            let connected = 0;
            for (const track of tabTracks) {
                const src = ctx.createMediaStreamSource(new MediaStream([track]));
                src.connect(dest);
                connected += 1;
            }
            for (const track of micTracks) {
                const src = ctx.createMediaStreamSource(new MediaStream([track]));
                const gain = ctx.createGain();
                gain.gain.value = 1.0;
                src.connect(gain);
                gain.connect(dest);
                connected += 1;
            }
            if (!connected) return [];
            return dest.stream.getAudioTracks();
        } catch {
            return [...tabTracks, ...micTracks];
        }
    };

    // Composite screen video + circular webcam bubble into a canvas and return its stream.
    const buildCompositeStream = async (displayStream, camMediaStream) => {
        const displayTrack = displayStream.getVideoTracks()[0];
        const settings = displayTrack?.getSettings?.() || {};
        const width = settings.width || 1280;
        const height = settings.height || 720;

        const screenVideo = document.createElement('video');
        screenVideo.srcObject = displayStream;
        screenVideo.muted = true;
        screenVideo.playsInline = true;
        await screenVideo.play().catch(() => {});
        screenVideoElRef.current = screenVideo;

        let camVideo = null;
        if (camMediaStream) {
            camVideo = document.createElement('video');
            camVideo.srcObject = camMediaStream;
            camVideo.muted = true;
            camVideo.playsInline = true;
            await camVideo.play().catch(() => {});
            camVideoElRef.current = camVideo;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });

        const computeBubble = () => {
            const size = Math.max(120, Math.min(260, Math.round(Math.min(width, height) * 0.16)));
            const margin = Math.round(size * 0.14);
            const cx = margin + size / 2;
            const cy = height - margin - size / 2;
            return { size, cx, cy };
        };

        let lastDraw = 0;
        const frameInterval = 1000 / 30;
        const draw = (now) => {
            rafRef.current = requestAnimationFrame(draw);
            if (now - lastDraw < frameInterval) return;
            lastDraw = now;
            try {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, width, height);
                if (screenVideo.readyState >= 2) {
                    ctx.drawImage(screenVideo, 0, 0, width, height);
                }
                if (camVideo && camOnRef.current && camVideo.readyState >= 2) {
                    const { size, cx, cy } = computeBubble();
                    const r = size / 2;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.clip();
                    ctx.translate(cx + r, cy - r);
                    ctx.scale(-1, 1);
                    const cw = camVideo.videoWidth || size;
                    const ch = camVideo.videoHeight || size;
                    const sr = cw / ch;
                    let sx = 0, sy = 0, sW = cw, sH = ch;
                    if (sr > 1) { sW = ch; sx = (cw - ch) / 2; }
                    else if (sr < 1) { sH = cw; sy = (ch - cw) / 2; }
                    ctx.drawImage(camVideo, sx, sy, sW, sH, 0, 0, size, size);
                    ctx.restore();
                }
            } catch { /* keep looping */ }
        };
        rafRef.current = requestAnimationFrame(draw);

        const canvasStream = canvas.captureStream(30);
        canvasStreamRef.current = canvasStream;
        return canvasStream;
    };

    useEffect(() => {
        window.__tskRecorderApi = {
            getState: () => ({ recording, paused, seconds, micOn, camOn, countdown }),
            stop: () => stop(),
            pauseResume: () => pauseResume(),
            restart: () => restart(),
            toggleMic: () => toggleMic(),
            toggleCam: () => toggleCam(),
        };
        return () => {
            try { if (window.__tskRecorderApi) delete window.__tskRecorderApi; } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recording, paused, seconds, micOn, camOn, countdown]);

    const finalizeAndOpenEditor = async (blob) => {
        if (!blob || blob.size === 0) {
            toast.error('Recording was empty');
            return;
        }
        try { await saveRecordingBlob(blob, { type: blob.type, size: blob.size }); } catch { /* noop */ }
        try { window.__tskLastRecordingBlob = blob; } catch { /* noop */ }
        const localUrl = URL.createObjectURL(blob);
        try { sessionStorage.setItem('tsk_last_recording_url', localUrl); } catch { /* noop */ }
        try { sessionStorage.setItem('tsk_last_recording_type', blob.type); } catch { /* noop */ }
        try { sessionStorage.setItem('tsk_last_recording_size', String(blob.size)); } catch { /* noop */ }
        if (onSaved) onSaved(blob, localUrl);
        toast.success('Recording ready — opening preview...');
        let editorWin = null;
        try { editorWin = window.open('/recording/edit?pending=1', '_blank'); } catch { /* noop */ }
        if (!editorWin) {
            toast.info('Popup blocked — opening editor in this tab');
            window.location.href = '/recording/edit?pending=1';
        }
    };

    const beginRecording = async () => {
        setStarting(true);
        let micErr = null;
        let camErr = null;
        try {
            if (camOn) {
                try {
                    const cam = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' },
                    });
                    camStreamRef.current = cam;
                    setCamStream(cam);
                } catch (e) { camErr = e; }
            }
            if (micOn) {
                try {
                    const mic = await navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    });
                    micStreamRef.current = mic;
                } catch (e) { micErr = e; }
            }

            const display = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30, cursor: 'always' },
                audio: true,
                selfBrowserSurface: 'include',
                surfaceSwitching: 'include',
                systemAudio: 'include',
            });
            displayStreamRef.current = display;
            const settings = display.getVideoTracks()[0]?.getSettings?.() || {};
            setDisplaySurface(settings.displaySurface || null);

            // Loom-style 3-2-1 after the user picks a surface
            for (let n = 3; n >= 1; n -= 1) {
                setCountdown(n);
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, 700));
            }
            setCountdown(null);

            let compositeStream = null;
            try {
                compositeStream = await buildCompositeStream(display, (camOn && camStreamRef.current) ? camStreamRef.current : null);
            } catch (err) {
                console.warn('Canvas composite failed — falling back to raw screen stream', err);
                toast.info('Webcam overlay disabled for this recording — continuing with just the screen.');
            }

            const audioTracks = mixAudioTracks(display, micStreamRef.current, micOn);
            const videoTracks = compositeStream?.getVideoTracks?.() || display.getVideoTracks();
            const mixed = new MediaStream([...videoTracks, ...audioTracks]);
            mixedStreamRef.current = mixed;

            const preferred = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
            const mimeType = preferred.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
            mimeTypeRef.current = mimeType || 'video/webm';
            // Loom-like quality: ~2.5 Mbps video + solid audio
            const rec = new MediaRecorder(mixed, {
                ...(mimeType ? { mimeType } : {}),
                videoBitsPerSecond: 2_500_000,
                audioBitsPerSecond: 128_000,
            });
            chunksRef.current = [];
            discardOnStopRef.current = false;
            rec.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
            rec.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                setRecording(false);
                setPaused(false);
                setSeconds(0);
                const wasDiscard = discardOnStopRef.current;
                discardOnStopRef.current = false;
                const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'video/webm' });
                chunksRef.current = [];
                stopAllTracks();
                try { controlsPopupRef.current?.close?.(); } catch { /* noop */ }
                setPopupOpen(false);
                if (wasDiscard) return;
                await finalizeAndOpenEditor(blob);
            };
            recorderRef.current = rec;
            display.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
            });
            rec.start(1000);
            setRecording(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

            openControlsPopup();

            const surf = settings.displaySurface;
            if (surf === 'monitor') toast.info('Recording your whole screen.');
            else if (surf === 'browser') toast.info('Recording this browser tab.');
            else if (surf === 'window') toast.info('Recording a window — controls opened in a separate mini window.');

            if (camErr) toast.warning('Webcam not available — continuing without it.');
            if (micErr) toast.warning('Mic not available — continuing without audio commentary.');
        } catch (e) {
            if (e?.name !== 'NotAllowedError') toast.error(e?.message || 'Could not start recording');
            setCountdown(null);
            stopAllTracks();
        } finally { setStarting(false); }
    };

    const start = () => beginRecording();

    const stop = () => {
        discardOnStopRef.current = false;
        try { if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop(); }
        catch { stopAllTracks(); }
        try { controlsPopupRef.current?.close?.(); } catch { /* noop */ }
        setPopupOpen(false);
    };

    const openControlsPopup = () => {
        try {
            const width = 380;
            const height = 120;
            const left = Math.max(0, (window.screen?.availWidth || 1200) - width - 24);
            const top = 24;
            const features = `popup=1,noopener=0,width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,location=0,status=0,resizable=1`;
            const w = window.open('/recording/controls', 'tsk_recording_controls', features);
            if (w) {
                controlsPopupRef.current = w;
                setPopupOpen(true);
                const check = setInterval(() => {
                    if (!controlsPopupRef.current || controlsPopupRef.current.closed) {
                        clearInterval(check);
                        setPopupOpen(false);
                    }
                }, 500);
            } else {
                toast.info('Popup blocked — using the in-tab floating controls instead.');
            }
        } catch { /* silent */ }
    };

    const pauseResume = () => {
        const rec = recorderRef.current;
        if (!rec) return;
        if (rec.state === 'recording') { rec.pause(); setPaused(true); }
        else if (rec.state === 'paused') { rec.resume(); setPaused(false); }
    };

    const restart = () => {
        // Discard the current take without opening the editor, then start a fresh one.
        discardOnStopRef.current = true;
        try { if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop(); } catch { /* noop */ }
        chunksRef.current = [];
        setTimeout(() => { beginRecording(); }, 350);
    };

    const toggleMic = () => {
        setMicOn((v) => {
            const on = !v;
            micStreamRef.current?.getAudioTracks?.().forEach((t) => { t.enabled = on; });
            return on;
        });
    };
    const toggleCam = () => {
        setCamOn((v) => {
            const on = !v;
            camStreamRef.current?.getVideoTracks?.().forEach((t) => { t.enabled = on; });
            return on;
        });
    };

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    return (
        <>
            {!recording && countdown == null && (
                <Button variant="outline" onClick={start} disabled={starting} className="rounded-full" size="sm" data-testid="start-recording-btn">
                    <Video className="w-4 h-4 mr-2" /> {starting ? 'Starting...' : 'Record Screen'}
                </Button>
            )}

            {countdown != null && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2147483647 }}
                    className="bg-black/50 flex items-center justify-center pointer-events-none" data-testid="recording-countdown">
                    <div className="w-28 h-28 rounded-full bg-red-600 text-white flex items-center justify-center text-5xl font-bold shadow-2xl animate-pulse">
                        {countdown}
                    </div>
                </div>
            )}

            {recording && !popupOpen && (
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

            {recording && popupOpen && (
                <div style={{ position: 'fixed', top: 12, left: 12, zIndex: 2147483647 }}
                    className="bg-black/70 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Recording · <span className="font-mono" data-testid="recording-timer">{fmt(seconds)}</span>
                    <button onClick={() => { try { controlsPopupRef.current?.focus?.(); } catch { /* noop */ } }} className="ml-1 text-indigo-200 hover:text-white underline decoration-dotted">Focus controls</button>
                </div>
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
