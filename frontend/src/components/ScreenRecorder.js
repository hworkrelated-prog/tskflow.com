import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Video, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecordingBlob } from '@/lib/recordingStore';
import { uploadBlob } from '@/lib/upload';
import { openRecordingHudOverlay, prepareRecordingHudOverlay, attachRecordingHudStream, closeRecordingHudOverlay, setHudCameraVisible, recordingOverlayNeeded } from '@/lib/recordingHudOverlay';
import { listScreens, matchScreenToCapture } from '@/lib/recordingDisplay';
import RecordingFloatingHud from '@/components/RecordingFloatingHud';
import IosScreenRecordGuide from '@/components/IosScreenRecordGuide';
import { canCaptureDisplay, pickRecorderMime } from '@/lib/recordingCapabilities';

/**
 * Loom-style screen recorder:
 *  - Mic + camera first, then free screen/window/tab picker
 *  - Pause / restart / stop with a movable HUD (camera + controls together)
 *  - Dual-screen uses Document PiP custom HUD — not a Chrome popup tab
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
    const [hudOverlayOpen, setHudOverlayOpen] = useState(false);
    const [showIosGuide, setShowIosGuide] = useState(false);

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
        setHudOverlayOpen(false);
        closeRecordingHudOverlay();
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
        // Open PiP from the click gesture before awaits consume activation.
        const hudPrep = prepareRecordingHudOverlay({ showCamera: camOn });
        try {
            if (camOn) {
                try {
                    const cam = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' },
                    });
                    camStreamRef.current = cam;
                    setCamStream(cam);
                    attachRecordingHudStream(cam);
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

            const needed = recordingOverlayNeeded(settings.displaySurface, matched.screen);
            let hud = await hudPrep.catch(() => ({ mode: 'none', win: null }));
            hud = await openRecordingHudOverlay({
                stream: camStreamRef.current,
                trackSettings: settings,
                needed: true,
                showCamera: !!camStreamRef.current,
                reuseExisting: hud?.mode === 'pip',
            });
            setHudOverlayOpen(hud.mode !== 'none');
            if (hud.placedOnOtherDisplay || (hud.mode === 'pip' && screens.length > 1)) {
                toast.success('Drag the recording controls onto the screen you are capturing.');
            } else if (hud.mode === 'none' && needed) {
                toast.info('Using the in-tab toolbar — Chrome can also show a Stop sharing bar.');
            }

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
                closeRecordingHudOverlay();
                setHudOverlayOpen(false);
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
            closeRecordingHudOverlay();
            stopAllTracks();
        } finally { setStarting(false); }
    };

    const start = () => {
        if (!canCaptureDisplay()) {
            setShowIosGuide(true);
            return;
        }
        beginRecording();
    };

    const attachIosVideo = async (file) => {
        if (!file) return;
        setShowIosGuide(false);
        await finalizeAndOpenEditor(file);
    };

    const startCameraWalkthrough = async () => {
        if (starting || recording) return;
        setShowIosGuide(false);
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            toast.error('Camera recording isn’t available. Attach a Screen Recording from Photos instead.');
            setShowIosGuide(true);
            return;
        }
        setStarting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            camStreamRef.current = stream;
            mixedStreamRef.current = stream;
            setCamStream(stream);
            const mimeType = pickRecorderMime();
            mimeTypeRef.current = mimeType || 'video/mp4';
            const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
            rec.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                setRecording(false);
                setSeconds(0);
                const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeTypeRef.current });
                stopAllTracks();
                await finalizeAndOpenEditor(blob);
            };
            recorderRef.current = rec;
            rec.start(1000);
            setRecording(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        } catch (e) {
            stopAllTracks();
            if (e?.name !== 'NotAllowedError') toast.error('Could not start camera recording.');
            setShowIosGuide(true);
        } finally {
            setStarting(false);
        }
    };

    const stop = () => {
        discardOnStopRef.current = false;
        try { if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop(); }
        catch { stopAllTracks(); }
        closeRecordingHudOverlay();
        setHudOverlayOpen(false);
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

    const pauseResume = () => {
        const rec = recorderRef.current;
        if (!rec) return;
        if (rec.state === 'recording') { rec.pause(); setPaused(true); }
        else if (rec.state === 'paused') { rec.resume(); setPaused(false); }
    };

    const restart = () => {
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
            setHudCameraVisible(on);
            return on;
        });
    };

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

            {/* One control surface only: PiP HUD when available, else in-tab bar. */}
            {recording && !hudOverlayOpen && (
                <RecordingFloatingHud
                    seconds={seconds}
                    paused={paused}
                    micOn={micOn}
                    camOn={camOn}
                    cameraStream={camStream}
                    showCamera
                    showTask
                    onPauseResume={pauseResume}
                    onRestart={restart}
                    onToggleMic={toggleMic}
                    onToggleCam={toggleCam}
                    onStop={stop}
                    onStartTask={startTaskFromRecording}
                />
            )}

            {recording && displaySurface === 'window' && !hudOverlayOpen && (
                <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2147483645 }}
                    className="max-w-xs bg-white border border-amber-300 shadow-xl rounded-2xl p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>You&apos;re recording a separate window. Use the toolbar on this tab, or Chrome&apos;s Stop sharing bar, if the overlay isn&apos;t visible.</span>
                </div>
            )}
            {recording && hudOverlayOpen && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 2147483645 }}
                    className="max-w-sm bg-slate-900/90 text-white shadow-xl rounded-2xl px-3.5 py-2 text-xs flex items-start gap-2 pointer-events-none"
                    data-testid="recording-pip-hint">
                    <span>Recording controls are in the floating window — drag it onto the screen you are capturing.</span>
                </div>
            )}
            <IosScreenRecordGuide
                open={showIosGuide}
                onOpenChange={setShowIosGuide}
                onPickVideo={attachIosVideo}
                onStartCameraWalkthrough={startCameraWalkthrough}
            />
        </>
    );
};

export default ScreenRecorder;
