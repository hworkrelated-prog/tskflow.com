import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Video, Square, Pause, Play, RotateCcw, Mic, MicOff, Camera, CameraOff, AlertCircle, Move, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecordingBlob } from '@/lib/recordingStore';
import { uploadBlob } from '@/lib/upload';
import { openRecordingControlsOverlay, closeRecordingControlsOverlay, recordingOverlayNeeded } from '@/lib/recordingControlsOverlay';
import { openRecordingCameraOverlay, closeRecordingCameraOverlay, setCameraOverlayVisible } from '@/lib/recordingCameraOverlay';
import { listScreens, matchScreenToCapture } from '@/lib/recordingDisplay';

const CtrlBtn = ({ onClick, title, active, danger, children, testId }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        data-testid={testId}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            danger
                ? 'bg-rose-500/90 hover:bg-rose-400 text-white'
                : active
                    ? 'bg-white/25 text-white'
                    : 'text-white/80 hover:bg-white/15 hover:text-white'
        }`}
    >
        {children}
    </button>
);

// Minimal glass floating control pill — low visual weight, stays out of the way.
const FloatingBar = ({ children, storageKey = 'tsk_rec_bar_pos' }) => {
    const clampPos = (p) => {
        const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
        const h = typeof window !== 'undefined' ? window.innerHeight : 768;
        return {
            x: Math.max(8, Math.min(w - 280, p?.x ?? 12)),
            y: Math.max(8, Math.min(h - 56, p?.y ?? (h - 64))),
        };
    };
    const [pos, setPos] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            const h = typeof window !== 'undefined' ? window.innerHeight : 768;
            return clampPos(saved || { x: 12, y: h - 64 });
        } catch {
            const h = typeof window !== 'undefined' ? window.innerHeight : 768;
            return clampPos({ x: 12, y: h - 64 });
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
            x: Math.max(4, Math.min(window.innerWidth - 260, evt.clientX - start.current.x)),
            y: Math.max(4, Math.min(window.innerHeight - 52, evt.clientY - start.current.y)),
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
        <div
            style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 2147483647 }}
            className="bg-slate-900/35 backdrop-blur-xl text-white rounded-full shadow-lg shadow-black/10 border border-white/20 flex items-center gap-0.5 pl-1 pr-1 py-1 select-none"
            data-testid="recording-floating-bar"
        >
            <div
                className="cursor-grab active:cursor-grabbing p-1.5 text-white/40 hover:text-white/75"
                onMouseDown={onDown}
                onTouchStart={onDown}
                title="Drag"
            >
                <Move className="w-3 h-3" />
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
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 2147483646 }}
            className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/70 shadow-lg bg-black/80 ring-1 ring-black/10">
            <video
                ref={videoRef}
                autoPlay muted playsInline
                style={{ transform: mirrored ? 'scaleX(-1)' : 'none', width: '100%', height: '100%', objectFit: 'cover' }}
            />
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
    const [camOverlayOpen, setCamOverlayOpen] = useState(false);
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
    const attachTaskOnStopRef = useRef(false);
    const camOnRef = useRef(camOn);

    useEffect(() => { camOnRef.current = camOn; }, [camOn]);

    const stopAllTracks = () => {
        if (rafRef.current) { try { cancelAnimationFrame(rafRef.current); } catch { /* noop */ } rafRef.current = null; }
        try {
            if (window.__tskRecHiddenTimer) { clearInterval(window.__tskRecHiddenTimer); delete window.__tskRecHiddenTimer; }
            if (window.__tskRecVisHandler) {
                document.removeEventListener('visibilitychange', window.__tskRecVisHandler);
                delete window.__tskRecVisHandler;
            }
        } catch { /* noop */ }
        try { audioCtxRef.current?.close?.(); } catch { /* noop */ }
        audioCtxRef.current = null;
        [displayStreamRef, micStreamRef, camStreamRef, mixedStreamRef, canvasStreamRef].forEach((r) => {
            try { r.current?.getTracks?.().forEach((t) => t.stop()); } catch { /* noop */ }
            r.current = null;
        });
        screenVideoElRef.current = null;
        camVideoElRef.current = null;
        setCamStream(null);
        setCamOverlayOpen(false);
        closeRecordingCameraOverlay();
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

    // Composite screen + webcam into a canvas. Uses rAF while visible and a
    // setInterval fallback when the tab is hidden (rAF is paused by browsers).
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

        const paint = () => {
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

        let lastDraw = 0;
        const frameInterval = 1000 / 30;
        const drawRaf = (now) => {
            rafRef.current = requestAnimationFrame(drawRaf);
            if (now - lastDraw < frameInterval) return;
            lastDraw = now;
            paint();
        };
        rafRef.current = requestAnimationFrame(drawRaf);

        // When the tab is backgrounded, rAF stops — keep painting via interval so
        // canvas.captureStream doesn't stick on the last frame.
        const hiddenTimer = setInterval(() => {
            if (document.visibilityState === 'hidden') paint();
        }, 33);
        try { window.__tskRecHiddenTimer = hiddenTimer; } catch { /* noop */ }

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
            startTask: () => startTaskFromRecording(),
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
            const screens = await listScreens();
            const matched = matchScreenToCapture(settings, screens);

            // Open follow-screen windows now — still inside the picker gesture.
            if (camStreamRef.current) {
                const camOverlay = await openRecordingCameraOverlay({
                    stream: camStreamRef.current,
                    trackSettings: settings,
                });
                setCamOverlayOpen(camOverlay.mode !== 'none');
                if (camOverlay.placedOnOtherDisplay) {
                    toast.success('Camera moved to the screen you are recording.');
                } else if (camOverlay.mode === 'popup' && screens.length > 1) {
                    toast.info('Drag the camera onto the screen you are recording if it landed on the wrong display.');
                }
            }
            await openControlsPopup(matched.screen, settings.displaySurface);

            // Loom-style 3-2-1 after the user picks a surface
            for (let n = 3; n >= 1; n -= 1) {
                setCountdown(n);
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, 700));
            }
            setCountdown(null);

            // Always record the raw display track. Baking webcam via canvas+rAF freezes when
            // the user switches tabs (browsers pause rAF; audio keeps going). Webcam is shown
            // as a live floating bubble during the session instead — Loom-style for the web.
            const audioTracks = mixAudioTracks(display, micStreamRef.current, micOn);
            const videoTracks = display.getVideoTracks();
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
                const attachTask = attachTaskOnStopRef.current;
                discardOnStopRef.current = false;
                attachTaskOnStopRef.current = false;
                const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'video/webm' });
                chunksRef.current = [];
                stopAllTracks();
                closeRecordingControlsOverlay();
                try { controlsPopupRef.current?.close?.(); } catch { /* noop */ }
                setPopupOpen(false);
                if (wasDiscard) return;
                if (attachTask) {
                    await attachRecordingToAiBar(blob);
                    return;
                }
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

            const surf = settings.displaySurface;
            if (surf === 'browser') toast.warning('Tab capture can freeze if you leave that tab — prefer Entire Screen.');

            if (camErr) toast.warning('Webcam not available — continuing without it.');
            if (micErr) toast.warning('Mic not available — continuing without audio commentary.');

            const onVis = () => {
                if (document.visibilityState === 'hidden' && surf === 'browser') {
                    toast.warning('This tab is in the background — video may freeze. Switch back or record Entire Screen.');
                }
            };
            document.addEventListener('visibilitychange', onVis);
            try { window.__tskRecVisHandler = onVis; } catch { /* noop */ }
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
        closeRecordingControlsOverlay();
        try { controlsPopupRef.current?.close?.(); } catch { /* noop */ }
        setPopupOpen(false);
    };

    const attachRecordingToAiBar = async (blob) => {
        if (!blob || blob.size === 0) {
            toast.error('Recording was empty');
            return;
        }
        try {
            const name = `screen-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
            toast.message('Attaching recording to your task…');
            const ref = await uploadBlob(blob, name, blob.type || 'video/webm');
            window.dispatchEvent(new CustomEvent('tskflow:attach-to-ai-create', {
                detail: { attachments: [ref] },
            }));
            window.dispatchEvent(new CustomEvent('tskflow:open-ai-create'));
            toast.success('Recording attached — finish the task in the bar below');
        } catch (e) {
            toast.error('Could not attach recording — try again from the library');
            await finalizeAndOpenEditor(blob);
        }
    };

    const startTaskFromRecording = () => {
        attachTaskOnStopRef.current = true;
        window.dispatchEvent(new CustomEvent('tskflow:start-task-from-recording'));
        toast.message('Finishing recording and opening your task…');
        stop();
    };

    const openControlsPopup = async (screen, displaySurface) => {
        const needed = recordingOverlayNeeded(displaySurface, screen);
        const result = await openRecordingControlsOverlay({ needed });
        if (result?.mode === 'none') {
            setPopupOpen(false);
            return;
        }
        controlsPopupRef.current = result.win;
        setPopupOpen(true);
        const check = setInterval(() => {
            if (!controlsPopupRef.current || controlsPopupRef.current.closed) {
                clearInterval(check);
                setPopupOpen(false);
            }
        }, 500);
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
            setCameraOverlayVisible(on);
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

            {/* Always keep a Loom-style draggable bar on the recording tab (bottom-left by default).
                A separate popup can also open, but this bar stays with the tab. */}
            {recording && (
                <FloatingBar>
                    <div className="flex items-center gap-1.5 pr-1.5 border-r border-white/15 mr-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-amber-300' : 'bg-rose-400 animate-pulse'}`} />
                        <span className="font-mono text-[11px] font-medium tabular-nums tracking-wide text-white/90" data-testid="recording-timer">{fmt(seconds)}</span>
                    </div>
                    <CtrlBtn onClick={pauseResume} title={paused ? 'Resume' : 'Pause'} active={paused}>
                        {paused ? <Play className="w-3.5 h-3.5" fill="currentColor" /> : <Pause className="w-3.5 h-3.5" />}
                    </CtrlBtn>
                    <CtrlBtn onClick={restart} title="Restart">
                        <RotateCcw className="w-3.5 h-3.5" />
                    </CtrlBtn>
                    <CtrlBtn onClick={toggleMic} title={micOn ? 'Mute mic' : 'Unmute mic'} active={!micOn}>
                        {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 opacity-70" />}
                    </CtrlBtn>
                    <CtrlBtn onClick={toggleCam} title={camOn ? 'Hide webcam' : 'Show webcam'} active={!camOn}>
                        {camOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5 opacity-70" />}
                    </CtrlBtn>
                    <button
                        type="button"
                        onClick={startTaskFromRecording}
                        className="ml-0.5 h-7 px-2.5 rounded-full bg-teal-600/90 hover:bg-teal-500 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                        data-testid="recording-start-task-btn"
                        title="Open the AI task bar — recording attaches when you stop"
                    >
                        <Plus className="w-3 h-3" /> Task
                    </button>
                    <button
                        type="button"
                        onClick={stop}
                        className="ml-0.5 h-7 px-2.5 rounded-full bg-rose-500/85 hover:bg-rose-400 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                        data-testid="stop-recording-btn"
                    >
                        <Square className="w-3 h-3" fill="currentColor" /> Stop
                    </button>
                </FloatingBar>
            )}

            {recording && camOn && camStream && !camOverlayOpen && <WebcamBubble stream={camStream} />}

            {recording && displaySurface === 'window' && !popupOpen && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2147483645 }}
                    className="max-w-xs bg-white border border-amber-300 shadow-xl rounded-2xl p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>You&apos;re recording a separate window. Use the toolbar on this tab, or Chrome&apos;s Stop sharing bar, if the overlay isn&apos;t visible.</span>
                </div>
            )}
        </>
    );
};

export default ScreenRecorder;
