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
        // Make sure the bar always ends up on-screen (fix "controls not visible" cases where
        // stale saved positions push it below the viewport).
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
        // Kick playback (autoplay is muted so browser allows it)
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
            {/* Small "REC" label so users understand this preview is being recorded into the canvas composite */}
            <div className="absolute bottom-1 left-1 right-1 flex justify-center pointer-events-none">
                <span className="text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded shadow">● REC</span>
            </div>
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
    const [popupOpen, setPopupOpen] = useState(false);
    const controlsPopupRef = useRef(null);

    const displayStreamRef = useRef(null);
    const micStreamRef = useRef(null);
    const camStreamRef = useRef(null);
    const mixedStreamRef = useRef(null);
    const canvasStreamRef = useRef(null);
    const rafRef = useRef(null);
    const screenVideoElRef = useRef(null);
    const camVideoElRef = useRef(null);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const mimeTypeRef = useRef('video/webm');

    const stopAllTracks = () => {
        if (rafRef.current) { try { cancelAnimationFrame(rafRef.current); } catch { /* noop */ } rafRef.current = null; }
        [displayStreamRef, micStreamRef, camStreamRef, mixedStreamRef, canvasStreamRef].forEach((r) => {
            try { r.current?.getTracks?.().forEach((t) => t.stop()); } catch { /* noop */ }
            r.current = null;
        });
        screenVideoElRef.current = null;
        camVideoElRef.current = null;
        setCamStream(null);
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

        // Bubble geometry (~14% of the smaller dimension, min 120px, capped 260px)
        const computeBubble = () => {
            const size = Math.max(120, Math.min(260, Math.round(Math.min(width, height) * 0.16)));
            const margin = Math.round(size * 0.14);
            const cx = margin + size / 2;
            const cy = height - margin - size / 2;
            return { size, cx, cy, margin };
        };

        const draw = () => {
            try {
                // 1) Fill background (black) then draw the screen frame
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, width, height);
                if (screenVideo.readyState >= 2) {
                    ctx.drawImage(screenVideo, 0, 0, width, height);
                }
                // 2) Draw circular webcam bubble in bottom-left, mirrored, with white border
                if (camVideo && camOnRef.current && camVideo.readyState >= 2) {
                    const { size, cx, cy } = computeBubble();
                    const r = size / 2;
                    ctx.save();
                    // White ring
                    ctx.beginPath();
                    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    // Clip to circle
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.clip();
                    // Mirror the webcam horizontally to feel natural
                    ctx.translate(cx + r, cy - r);
                    ctx.scale(-1, 1);
                    // Cover fit: compute source crop to preserve aspect
                    const cw = camVideo.videoWidth || size;
                    const ch = camVideo.videoHeight || size;
                    const sr = cw / ch;
                    let sx = 0, sy = 0, sW = cw, sH = ch;
                    if (sr > 1) { // wider than tall
                        sW = ch; sx = (cw - ch) / 2;
                    } else if (sr < 1) {
                        sH = cw; sy = (ch - cw) / 2;
                    }
                    ctx.drawImage(camVideo, sx, sy, sW, sH, 0, 0, size, size);
                    ctx.restore();
                }
            } catch { /* keep looping */ }
            rafRef.current = requestAnimationFrame(draw);
        };
        rafRef.current = requestAnimationFrame(draw);

        const canvasStream = canvas.captureStream(30);
        canvasStreamRef.current = canvasStream;
        return canvasStream;
    };

    // Keep a live ref of camOn so the draw loop reflects toggles in real time
    const camOnRef = useRef(camOn);
    useEffect(() => { camOnRef.current = camOn; }, [camOn]);

    // Expose a small imperative API on window so the standalone controls popup can drive us.
    useEffect(() => {
        window.__tskRecorderApi = {
            getState: () => ({ recording, paused, seconds, micOn, camOn }),
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
    }, [recording, paused, seconds, micOn, camOn]);

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

            // 3) Build the composite video via canvas (screen + circular webcam bubble)
            const compositeStream = await buildCompositeStream(display, (camOn && camStreamRef.current) ? camStreamRef.current : null);

            // Mix audio: tab audio (from getDisplayMedia) + mic audio (if enabled)
            const audioTracks = [
                ...(display.getAudioTracks() || []),
                ...((micStreamRef.current && micOn && micStreamRef.current.getAudioTracks()) || []),
            ];
            const mixed = new MediaStream([...compositeStream.getVideoTracks(), ...audioTracks]);
            mixedStreamRef.current = mixed;

            const preferred = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
            const mimeType = preferred.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
            mimeTypeRef.current = mimeType || 'video/webm';
            const rec = new MediaRecorder(mixed, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_200_000 });
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
                // Persist the blob in IndexedDB so the editor can reliably retrieve it
                // even when opened in a new tab (window.opener is unreliable with COOP).
                try { await saveRecordingBlob(blob, { type: blob.type, size: blob.size }); } catch { /* noop */ }
                // Also stash on window and sessionStorage as best-effort fallbacks
                try { window.__tskLastRecordingBlob = blob; } catch { /* noop */ }
                const localUrl = URL.createObjectURL(blob);
                try { sessionStorage.setItem('tsk_last_recording_url', localUrl); } catch { /* noop */ }
                try { sessionStorage.setItem('tsk_last_recording_type', blob.type); } catch { /* noop */ }
                try { sessionStorage.setItem('tsk_last_recording_size', String(blob.size)); } catch { /* noop */ }
                if (onSaved) onSaved(blob, localUrl);
                toast.success('Recording ready — opening preview...');
                // Open the editor. Pass empty features string so window.opener stays accessible
                // as an additional fallback (IndexedDB is the primary channel now).
                let editorWin = null;
                try { editorWin = window.open('/recording/edit?pending=1', '_blank'); } catch { /* noop */ }
                if (!editorWin) {
                    // Popup blocked — same-tab fallback
                    toast.info('Popup blocked — opening editor in this tab');
                    window.location.href = '/recording/edit?pending=1';
                }
            };
            recorderRef.current = rec;
            display.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
            });
            rec.start(1000);
            setRecording(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

            // Open a small popup window with the controls so they truly "float over the selected screen"
            // (as a separate OS window instead of an overlay inside the recorded tab).
            openControlsPopup();

            const surf = settings.displaySurface;
            if (surf === 'monitor') toast.info('Recording your whole screen.');
            else if (surf === 'browser') toast.info('Recording this browser tab.');
            else if (surf === 'window') toast.info('Recording a window — controls opened in a separate mini window.');

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
        try { controlsPopupRef.current?.close?.(); } catch { /* noop */ }
        setPopupOpen(false);
    };

    // Open a small standalone OS window (via popup features) so controls "float" separately from the recorded surface.
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
                // Detect when user closes the popup so we can fall back to the in-tab bar
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

            {/* When the popup controls window is up, show a small status indicator at the top-left. */}
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
