import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Paperclip, Video, X, Loader2, Video as VideoIcon, FileText, Image as ImageIcon, Mic, MicOff, Camera, CameraOff, Volume2, VolumeX, Play, Trash2, RotateCw } from 'lucide-react';
import { uploadBlob, fileUrl } from '@/lib/upload';
import { openRecordingHudOverlay, prepareRecordingHudOverlay, attachRecordingHudStream, closeRecordingHudOverlay, setHudCameraVisible, recordingOverlayNeeded } from '@/lib/recordingHudOverlay';
import { listScreens, matchScreenToCapture } from '@/lib/recordingDisplay';
import { saveRecordingBlob } from '@/lib/recordingStore';
import RecordingFloatingHud from '@/components/RecordingFloatingHud';
import IosScreenRecordGuide from '@/components/IosScreenRecordGuide';
import { canCaptureDisplay, pickRecorderMime, recordingFilename } from '@/lib/recordingCapabilities';
import SlackAttachGrid from '@/components/SlackAttachGrid';

const OptionToggle = ({ on, onClick, iconOn, iconOff, label, dataTestId }) => (
    <button
        type="button"
        onClick={onClick}
        data-testid={dataTestId}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
    >
        {on ? iconOn : iconOff}
        {label}
    </button>
);

export const AttachmentPicker = forwardRef(({
    attachments,
    setAttachments,
    requiresScreenRecording = false,
    compact = false,
}, ref) => {
    const fileInputRef = useRef(null);
    const [uploads, setUploads] = useState({});
    const [recording, setRecording] = useState(false);
    const [paused, setPaused] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [starting, setStarting] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [opts, setOpts] = useState({ mic: true, camera: true, systemAudio: true });
    const [permissionState, setPermissionState] = useState({ mic: null, camera: null });
    const [showAdvancedOpts, setShowAdvancedOpts] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewBlob, setPreviewBlob] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [savedAttachment, setSavedAttachment] = useState(null);
    const [savingPreview, setSavingPreview] = useState(false);
    const [camStream, setCamStream] = useState(null);
    const [replaySrc, setReplaySrc] = useState('');
    const [hudOverlayOpen, setHudOverlayOpen] = useState(false);
    const [showIosGuide, setShowIosGuide] = useState(false);
    const [attachingIos, setAttachingIos] = useState(false);

    const recorderRef = useRef(null);
    const streamsRef = useRef({ screen: null, mic: null, camera: null, composed: null });
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const rafRef = useRef(null);
    const discardOnStopRef = useRef(false);

    useEffect(() => {
        return () => {
            cleanupStreams();
            closeRecordingHudOverlay();
            try { if (window.__tskRecorderApi) delete window.__tskRecorderApi; } catch { /* noop */ }
        };
    }, []);

    // Probe mic/camera permissions so we can hide toggles that are already allowed.
    useEffect(() => {
        if (!showOptions) return undefined;
        let cancelled = false;
        (async () => {
            const next = { mic: null, camera: null };
            try {
                if (navigator.permissions?.query) {
                    try {
                        const mic = await navigator.permissions.query({ name: 'microphone' });
                        if (!cancelled) next.mic = mic.state;
                    } catch { /* unsupported name in some browsers */ }
                    try {
                        const cam = await navigator.permissions.query({ name: 'camera' });
                        if (!cancelled) next.camera = cam.state;
                    } catch { /* unsupported name in some browsers */ }
                }
            } catch { /* noop */ }
            if (!cancelled) {
                setPermissionState(next);
                // Already allowed → keep toggles collapsed unless the user expands them.
                if (next.mic === 'granted' && next.camera === 'granted') {
                    setShowAdvancedOpts(false);
                } else {
                    setShowAdvancedOpts(true);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [showOptions]);

    useImperativeHandle(ref, () => ({
        startRecording: () => startRecording(),
        isRecording: () => recording || starting,
    }));

    useEffect(() => {
        if (!previewBlob) {
            setPreviewUrl('');
            return undefined;
        }
        const url = URL.createObjectURL(previewBlob);
        setPreviewUrl(url);
        return () => {
            try { URL.revokeObjectURL(url); } catch { /* noop */ }
        };
    }, [previewBlob]);

    useEffect(() => {
        window.__tskRecorderApi = {
            getState: () => ({
                recording,
                paused,
                seconds,
                micOn: opts.mic,
                camOn: opts.camera,
            }),
            stop: () => stopRecording(),
            pauseResume: () => pauseResume(),
            restart: () => restartRecording(),
            toggleMic: () => toggleMic(),
            toggleCam: () => toggleCam(),
        };
        return () => {
            try { if (window.__tskRecorderApi) delete window.__tskRecorderApi; } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recording, paused, seconds, opts.mic, opts.camera]);

    const cleanupStreams = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        Object.values(streamsRef.current).forEach(s => {
            if (s) { try { s.getTracks().forEach(t => t.stop()); } catch (_) { /* ignore */ } }
        });
        streamsRef.current = { screen: null, mic: null, camera: null, composed: null };
        setCamStream(null);
    };

    const doUpload = async (blob, filename, contentType) => {
        const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setUploads((u) => ({ ...u, [tempId]: { name: filename, progress: 0 } }));
        try {
            const ref = await uploadBlob(blob, filename, contentType, (p) => {
                setUploads((u) => ({ ...u, [tempId]: { name: filename, progress: p } }));
            });
            setAttachments((prev) => [...prev, ref]);
            return ref;
        } catch (e) {
            const detail = e?.response?.data?.detail || e?.message || `Failed to upload ${filename}`;
            toast.error(typeof detail === 'string' ? detail : `Failed to upload ${filename}`);
            return null;
        } finally {
            setUploads((u) => {
                const next = { ...u };
                delete next[tempId];
                return next;
            });
        }
    };

    const handleFiles = (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach((f) => doUpload(f, f.name, f.type));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const requestMediaPermissions = async () => {
        const needMic = opts.mic;
        const needCam = opts.camera;
        if (!needMic && !needCam) return { mic: null, camera: null };
        const constraints = {};
        if (needMic) constraints.audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        if (needCam) constraints.video = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const micTracks = stream.getAudioTracks();
            const camTracks = stream.getVideoTracks();
            const micStream = micTracks.length ? new MediaStream(micTracks) : null;
            const camStream = camTracks.length ? new MediaStream(camTracks) : null;
            setPermissionState({ mic: needMic ? 'granted' : null, camera: needCam ? 'granted' : null });
            return { mic: micStream, camera: camStream };
        } catch (err) {
            setPermissionState({ mic: needMic ? 'denied' : null, camera: needCam ? 'denied' : null });
            if (err && err.name === 'NotAllowedError') {
                toast.error('Mic/Camera permission denied. Enable them in your browser to record with audio and camera.');
            } else {
                toast.error('Could not access mic or camera.');
            }
            return { mic: null, camera: null };
        }
    };

    const attachIosVideo = async (file) => {
        if (!file) return;
        setAttachingIos(true);
        try {
            const name = file.name || recordingFilename(file.type || 'video/mp4');
            const ref = await doUpload(file, name, file.type || 'video/mp4');
            if (ref) {
                setShowIosGuide(false);
                toast.success('Screen recording attached.');
            }
        } finally {
            setAttachingIos(false);
        }
    };

    const startCameraWalkthrough = async () => {
        if (starting || recording) return;
        setShowIosGuide(false);
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            toast.error('Camera recording isn’t available here. Attach a Screen Recording from Photos instead.');
            setShowIosGuide(true);
            return;
        }
        setStarting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            });
            streamsRef.current.camera = stream;
            streamsRef.current.composed = stream;
            setCamStream(stream);
            const mimeType = pickRecorderMime();
            const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            recorderRef.current = rec;
            chunksRef.current = [];
            rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
            rec.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                setRecording(false);
                setPaused(false);
                setSeconds(0);
                const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || 'video/mp4' });
                cleanupStreams();
                if (blob.size > 0) {
                    setSavedAttachment(null);
                    setReplaySrc('');
                    setPreviewBlob(blob);
                    setShowPreview(true);
                    try { await saveRecordingBlob(blob, { type: blob.type, size: blob.size }); } catch { /* noop */ }
                } else {
                    toast.error('Recording was empty - try again');
                }
            };
            rec.start(1000);
            setRecording(true);
            setPaused(false);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        } catch (e) {
            cleanupStreams();
            if (e?.name === 'NotAllowedError') {
                toast.error('Camera permission is needed, or attach a Screen Recording from Photos.');
            } else {
                toast.error('Could not start camera recording.');
            }
            setShowIosGuide(true);
        } finally {
            setStarting(false);
        }
    };

    const startRecording = async () => {
        if (starting || recording) return;
        if (!canCaptureDisplay()) {
            setShowIosGuide(true);
            return;
        }
        setStarting(true);
        // Open PiP while the click gesture is still valid - after getDisplayMedia it is gone.
        const hudPrep = prepareRecordingHudOverlay({ showCamera: opts.camera });
        try {
            const { mic: micStream, camera: cameraStream } = await requestMediaPermissions();
            streamsRef.current.mic = micStream;
            streamsRef.current.camera = cameraStream;
            setCamStream(cameraStream);
            if (cameraStream) attachRecordingHudStream(cameraStream);

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: opts.systemAudio,
            });
            streamsRef.current.screen = screenStream;
            const settings = screenStream.getVideoTracks()[0]?.getSettings?.() || {};
            const screens = await listScreens();
            const matched = matchScreenToCapture(settings, screens);

            // Always use the raw display track - canvas+rAF freezes when the tab is
            // backgrounded (audio would keep going). Camera is optional preview only.
            const videoTrackForRecording = screenStream.getVideoTracks()[0];
            let audioTrack = null;
            const hasSystemAudio = opts.systemAudio && screenStream.getAudioTracks().length > 0;
            const hasMic = !!micStream;
            if (hasSystemAudio || hasMic) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                const ac = new AudioCtx();
                const dest = ac.createMediaStreamDestination();
                if (hasSystemAudio) {
                    ac.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks())).connect(dest);
                }
                if (hasMic) {
                    ac.createMediaStreamSource(micStream).connect(dest);
                }
                audioTrack = dest.stream.getAudioTracks()[0];
            }

            const composed = new MediaStream();
            composed.addTrack(videoTrackForRecording);
            if (audioTrack) composed.addTrack(audioTrack);
            streamsRef.current.composed = composed;

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
                ? 'video/webm;codecs=vp9,opus'
                : (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm');
            const rec = new MediaRecorder(composed, { mimeType, videoBitsPerSecond: 2_500_000 });
            recorderRef.current = rec;
            chunksRef.current = [];
            rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
            rec.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                setRecording(false);
                setPaused(false);
                setSeconds(0);
                closeRecordingHudOverlay();
                setHudOverlayOpen(false);
                const wasDiscard = discardOnStopRef.current;
                discardOnStopRef.current = false;
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                cleanupStreams();
                if (wasDiscard) {
                    setTimeout(() => { startRecording(); }, 350);
                    return;
                }
                if (blob.size > 0) {
                    setSavedAttachment(null);
                    setReplaySrc('');
                    setPreviewBlob(blob);
                    setShowPreview(true);
                    try { await saveRecordingBlob(blob, { type: blob.type, size: blob.size }); } catch { /* noop */ }
                } else {
                    toast.error('Recording was empty - try again');
                }
            };
            rec.onerror = () => {
                toast.error('Recording error - please try again');
                cleanupStreams();
                setRecording(false);
                setSeconds(0);
            };
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
            });
            rec.start(1000);
            setRecording(true);
            setPaused(false);
            setShowOptions(false);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

            const needed = recordingOverlayNeeded(settings.displaySurface, matched.screen);
            let hud = await hudPrep.catch(() => ({ mode: 'none', win: null }));
            hud = await openRecordingHudOverlay({
                stream: cameraStream,
                trackSettings: settings,
                needed: true,
                showCamera: !!cameraStream || opts.camera,
                reuseExisting: hud?.mode === 'pip',
            });
            setHudOverlayOpen(hud.mode === 'pip');
            if (hud.placedOnOtherDisplay || (hud.mode === 'pip' && screens.length > 1)) {
                toast.success('Drag the recording controls onto the screen you are capturing.');
            } else if (hud.mode === 'none' && needed) {
                toast.info('Using the in-tab toolbar - Chrome can also show a Stop sharing bar.');
            }
        } catch (e) {
            closeRecordingHudOverlay();
            try {
                if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                    recorderRef.current.stop();
                } else {
                    cleanupStreams();
                }
            } catch (_) {
                cleanupStreams();
            }
            if (e && e.name !== 'NotAllowedError') {
                console.error(e);
                toast.error('Could not start screen recording');
            }
        } finally {
            setStarting(false);
        }
    };

    const stopRecording = () => {
        discardOnStopRef.current = false;
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
        closeRecordingHudOverlay();
        setHudOverlayOpen(false);
    };

    const pauseResume = () => {
        const rec = recorderRef.current;
        if (!rec) return;
        if (rec.state === 'recording') { rec.pause(); setPaused(true); }
        else if (rec.state === 'paused') { rec.resume(); setPaused(false); }
    };

    const restartRecording = () => {
        discardOnStopRef.current = true;
        try { if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop(); } catch { /* noop */ }
        chunksRef.current = [];
    };

    const toggleMic = () => {
        setOpts((prev) => {
            const on = !prev.mic;
            streamsRef.current.mic?.getAudioTracks?.().forEach((t) => { t.enabled = on; });
            return { ...prev, mic: on };
        });
    };

    const toggleCam = () => {
        setOpts((prev) => {
            const on = !prev.camera;
            streamsRef.current.camera?.getVideoTracks?.().forEach((t) => { t.enabled = on; });
            setHudCameraVisible(on);
            return { ...prev, camera: on };
        });
    };

    const handleSaveRecording = async () => {
        if (!previewBlob || savingPreview) return;
        setSavingPreview(true);
        try {
            const filename = recordingFilename(previewBlob.type || 'video/webm');
            const ref = await doUpload(previewBlob, filename, previewBlob.type || 'video/webm');
            if (!ref) return;
            setSavedAttachment(ref);
            // Saved → close immediately; attachment chip is the replay surface.
            setShowPreview(false);
            setPreviewBlob(null);
            setReplaySrc('');
            toast.success('Recording saved to this task.');
        } finally {
            setSavingPreview(false);
        }
    };

    const handleDiscardRecording = () => {
        setShowPreview(false);
        setPreviewBlob(null);
        setSavedAttachment(null);
        setReplaySrc('');
        toast.info('Recording discarded');
    };

    const handleRecordAgain = () => {
        setShowPreview(false);
        setPreviewBlob(null);
        setSavedAttachment(null);
        setReplaySrc('');
        startRecording();
    };

    const replayAttachment = (att) => {
        if (att?.storage_path) {
            setReplaySrc(fileUrl(att.storage_path));
        } else if (previewUrl) {
            setReplaySrc('');
        }
        setShowPreview(true);
    };

    const removeAttachment = (id) => setAttachments((prev) => prev.filter((a) => a.id !== id));

    const uploadList = Object.entries(uploads);

    return (
        <div className="space-y-3">
            {requiresScreenRecording && !compact && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                    <strong>⚠️ Screen recording required</strong> - This task requires a screen recording for completion proof.
                </div>
            )}

            {!compact && (
            <div className="flex flex-wrap gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFiles} multiple hidden />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-full" size="sm">
                    <Paperclip className="w-4 h-4 mr-2" />
                    Attach Files
                </Button>
                {!recording && (
                    <Button type="button" variant="outline" onClick={() => startRecording()} className="rounded-full" disabled={starting} size="sm" data-testid="record-screen-btn">
                        <Video className="w-4 h-4 mr-2" />
                        {starting ? 'Starting...' : 'Record Screen'}
                    </Button>
                )}
            </div>
            )}

            {compact && starting && !recording && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-2" data-testid="recording-starting">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting capture…
                </p>
            )}

            <IosScreenRecordGuide
                open={showIosGuide}
                onOpenChange={setShowIosGuide}
                onPickVideo={attachIosVideo}
                onStartCameraWalkthrough={startCameraWalkthrough}
                attaching={attachingIos}
            />

            {!compact && showOptions && !recording && (
                <div className="p-3 bg-slate-50 rounded-xl border space-y-3" data-testid="recording-options-panel">
                    {(() => {
                        const micGranted = permissionState.mic === 'granted';
                        const camGranted = permissionState.camera === 'granted';
                        const allAllowed = micGranted && camGranted;
                        const showMic = showAdvancedOpts || !micGranted;
                        const showCam = showAdvancedOpts || !camGranted;
                        const showSys = showAdvancedOpts || !allAllowed;
                        const anyToggle = showMic || showCam || showSys;
                        return (
                            <>
                                {allAllowed && !showAdvancedOpts ? (
                                    <p className="text-xs text-muted-foreground">
                                        Mic &amp; camera already allowed - start when ready.
                                        {' '}
                                        <button
                                            type="button"
                                            className="underline underline-offset-2 hover:text-foreground"
                                            onClick={() => setShowAdvancedOpts(true)}
                                            data-testid="show-recording-options"
                                        >
                                            Change options
                                        </button>
                                    </p>
                                ) : (
                                    <>
                                        <p className="text-xs font-medium text-muted-foreground">Recording options:</p>
                                        {anyToggle && (
                                            <div className="flex flex-wrap gap-2">
                                                {showMic && (
                                                    <OptionToggle
                                                        on={opts.mic}
                                                        onClick={() => setOpts({ ...opts, mic: !opts.mic })}
                                                        iconOn={<Mic className="w-3 h-3" />}
                                                        iconOff={<MicOff className="w-3 h-3" />}
                                                        label="Microphone"
                                                        dataTestId="toggle-mic"
                                                    />
                                                )}
                                                {showCam && (
                                                    <OptionToggle
                                                        on={opts.camera}
                                                        onClick={() => setOpts({ ...opts, camera: !opts.camera })}
                                                        iconOn={<Camera className="w-3 h-3" />}
                                                        iconOff={<CameraOff className="w-3 h-3" />}
                                                        label="Camera"
                                                        dataTestId="toggle-camera"
                                                    />
                                                )}
                                                {showSys && (
                                                    <OptionToggle
                                                        on={opts.systemAudio}
                                                        onClick={() => setOpts({ ...opts, systemAudio: !opts.systemAudio })}
                                                        iconOn={<Volume2 className="w-3 h-3" />}
                                                        iconOff={<VolumeX className="w-3 h-3" />}
                                                        label="System Audio"
                                                        dataTestId="toggle-system-audio"
                                                    />
                                                )}
                                            </div>
                                        )}
                                        {allAllowed && showAdvancedOpts && (
                                            <button
                                                type="button"
                                                className="text-xs text-muted-foreground underline underline-offset-2"
                                                onClick={() => setShowAdvancedOpts(false)}
                                            >
                                                Hide options
                                            </button>
                                        )}
                                    </>
                                )}
                            </>
                        );
                    })()}
                    <Button type="button" onClick={startRecording} disabled={starting} className="w-full rounded-full" size="sm">
                        {starting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting...</> : 'Start Recording'}
                    </Button>
                </div>
            )}

            {/* One control surface only: PiP HUD when available, else in-tab bar. */}
            {recording && !hudOverlayOpen && (
                <RecordingFloatingHud
                    seconds={seconds}
                    paused={paused}
                    micOn={opts.mic}
                    camOn={opts.camera}
                    cameraStream={camStream}
                    showCamera={opts.camera || !!camStream}
                    onPauseResume={pauseResume}
                    onRestart={restartRecording}
                    onToggleMic={toggleMic}
                    onToggleCam={toggleCam}
                    onStop={stopRecording}
                    storageKey="tsk_att_rec_hud_pos"
                />
            )}

            {/* Preview Dialog - closes automatically after Save */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-2xl sm:max-w-3xl p-0 overflow-hidden gap-0">
                    <DialogHeader className="px-5 pt-5 pb-3">
                        <DialogTitle>Preview your recording</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 px-5 pb-5">
                        {(replaySrc || previewUrl) && (
                            <div
                                className="relative w-full overflow-hidden rounded-xl bg-black ring-1 ring-black/10"
                                style={{ aspectRatio: '16 / 9' }}
                                data-testid="recording-preview-frame"
                            >
                                <video
                                    key={replaySrc || previewUrl}
                                    src={replaySrc || previewUrl}
                                    controls
                                    autoPlay
                                    playsInline
                                    className="absolute inset-0 h-full w-full object-contain"
                                    data-testid="recording-preview-video"
                                />
                            </div>
                        )}
                        <div className="flex gap-3 justify-end flex-wrap">
                            <Button
                                variant="outline"
                                onClick={handleDiscardRecording}
                                className="rounded-full"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Discard
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleRecordAgain}
                                className="rounded-full"
                            >
                                <RotateCw className="w-4 h-4 mr-2" />
                                Record Again
                            </Button>
                            <Button
                                onClick={handleSaveRecording}
                                disabled={savingPreview || !previewBlob}
                                className="rounded-full bg-green-600 hover:bg-green-700"
                                data-testid="save-recording-btn"
                            >
                                {savingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                                {savingPreview ? 'Saving…' : 'Save Recording'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {uploadList.length > 0 && (
                <div className="space-y-2">
                    {uploadList.map(([tempId, { name, progress }]) => (
                        <div key={tempId} className="text-xs text-muted-foreground flex items-center gap-2 bg-slate-50 p-2 rounded">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span className="truncate flex-1">{name}</span>
                            <span className="shrink-0">{progress}%</span>
                        </div>
                    ))}
                </div>
            )}

            {!compact && attachments.length > 0 && (
                <SlackAttachGrid
                    attachments={attachments}
                    onRemove={(att) => removeAttachment(att.id)}
                    testId="picker-slack-grid"
                />
            )}
        </div>
    );
});

AttachmentPicker.displayName = 'AttachmentPicker';

export default AttachmentPicker;
