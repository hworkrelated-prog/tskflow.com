import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Paperclip, Video, Square, X, Loader2, Video as VideoIcon, FileText, Image as ImageIcon, Mic, MicOff, Camera, CameraOff, Volume2, VolumeX, Play, Pause, Trash2, RotateCw } from 'lucide-react';
import { uploadBlob } from '@/lib/upload';
import { openRecordingControlsOverlay, closeRecordingControlsOverlay } from '@/lib/recordingControlsOverlay';

const iconFor = (kind) => {
    if (kind === 'video') return <VideoIcon className="w-4 h-4 text-teal-500" />;
    if (kind === 'image') return <ImageIcon className="w-4 h-4 text-teal-500" />;
    return <FileText className="w-4 h-4 text-teal-500" />;
};

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

export const AttachmentPicker = ({ attachments, setAttachments, requiresScreenRecording = false }) => {
    const fileInputRef = useRef(null);
    const [uploads, setUploads] = useState({});
    const [recording, setRecording] = useState(false);
    const [paused, setPaused] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [starting, setStarting] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [opts, setOpts] = useState({ mic: true, camera: true, systemAudio: true });
    const [permissionState, setPermissionState] = useState({ mic: null, camera: null });
    const [showPreview, setShowPreview] = useState(false);
    const [previewBlob, setPreviewBlob] = useState(null);

    const recorderRef = useRef(null);
    const streamsRef = useRef({ screen: null, mic: null, camera: null, composed: null });
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const canvasRef = useRef(null);
    const videoRefs = useRef({ screen: null, camera: null });
    const rafRef = useRef(null);
    const cameraPreviewRef = useRef(null);
    const discardOnStopRef = useRef(false);

    useEffect(() => {
        return () => {
            cleanupStreams();
            closeRecordingControlsOverlay();
            try { if (window.__tskRecorderApi) delete window.__tskRecorderApi; } catch { /* noop */ }
        };
    }, []);

    // Wire webcam preview after the floating <video> mounts (refs are null during startRecording).
    useEffect(() => {
        if (!recording) return undefined;
        const el = cameraPreviewRef.current;
        const cam = streamsRef.current.camera;
        if (el && cam) {
            el.srcObject = cam;
            el.play().catch(() => {});
        }
        return undefined;
    }, [recording]);

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
    };

    const doUpload = async (blob, filename, contentType) => {
        const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setUploads((u) => ({ ...u, [tempId]: { name: filename, progress: 0 } }));
        try {
            const ref = await uploadBlob(blob, filename, contentType, (p) => {
                setUploads((u) => ({ ...u, [tempId]: { name: filename, progress: p } }));
            });
            setAttachments((prev) => [...prev, ref]);
        } catch (e) {
            toast.error(`Failed to upload ${filename}`);
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

    const startRecording = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            toast.error('Screen recording is not supported in this browser. Try Chrome.');
            return;
        }
        setStarting(true);
        try {
            const { mic: micStream, camera: cameraStream } = await requestMediaPermissions();
            streamsRef.current.mic = micStream;
            streamsRef.current.camera = cameraStream;

            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 }, // Fixed: consistent 30fps for smoother recording
                audio: opts.systemAudio,
            });
            streamsRef.current.screen = screenStream;

            // Always use the raw display track — canvas+rAF freezes when the tab is
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
                closeRecordingControlsOverlay();
                const wasDiscard = discardOnStopRef.current;
                discardOnStopRef.current = false;
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                cleanupStreams();
                if (wasDiscard) {
                    setTimeout(() => { startRecording(); }, 350);
                    return;
                }
                if (blob.size > 0) {
                    // Show preview instead of auto-uploading
                    setPreviewBlob(blob);
                    setShowPreview(true);
                } else {
                    toast.error('Recording was empty — try again');
                }
            };
            rec.onerror = () => {
                toast.error('Recording error — please try again');
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
            const overlay = await openRecordingControlsOverlay();
            if (overlay?.mode === 'pip') {
                toast.success('Floating controls opened — they stay on top while you present.');
            } else if (overlay?.mode === 'none') {
                toast.info('Using in-tab controls — allow popups or use Chrome for always-on-top controls while presenting.');
            }
            // Webcam preview is wired in the `recording` useEffect once the <video> mounts.
        } catch (e) {
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
        closeRecordingControlsOverlay();
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
            return { ...prev, camera: on };
        });
    };

    const handleSaveRecording = async () => {
        if (previewBlob) {
            await doUpload(previewBlob, `screen-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`, 'video/webm');
            setShowPreview(false);
            setPreviewBlob(null);
            toast.success('Recording saved!');
        }
    };

    const handleDiscardRecording = () => {
        setShowPreview(false);
        setPreviewBlob(null);
        toast.info('Recording discarded');
    };

    const handleRecordAgain = () => {
        setShowPreview(false);
        setPreviewBlob(null);
        startRecording();
    };

    const removeAttachment = (id) => setAttachments((prev) => prev.filter((a) => a.id !== id));

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const uploadList = Object.entries(uploads);

    return (
        <div className="space-y-3">
            {requiresScreenRecording && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                    <strong>⚠️ Screen recording required</strong> - This task requires a screen recording for completion proof.
                </div>
            )}
            
            <div className="flex flex-wrap gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFiles} multiple hidden />
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-full" size="sm">
                    <Paperclip className="w-4 h-4 mr-2" />
                    Attach Files
                </Button>
                {!recording && (
                    <Button type="button" variant="outline" onClick={() => setShowOptions(!showOptions)} className="rounded-full" disabled={starting} size="sm">
                        <Video className="w-4 h-4 mr-2" />
                        {starting ? 'Starting...' : 'Record Screen'}
                    </Button>
                )}
            </div>

            {showOptions && !recording && (
                <div className="p-3 bg-slate-50 rounded-xl border space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Recording options:</p>
                    <div className="flex flex-wrap gap-2">
                        <OptionToggle
                            on={opts.mic}
                            onClick={() => setOpts({ ...opts, mic: !opts.mic })}
                            iconOn={<Mic className="w-3 h-3" />}
                            iconOff={<MicOff className="w-3 h-3" />}
                            label="Microphone"
                            dataTestId="toggle-mic"
                        />
                        <OptionToggle
                            on={opts.camera}
                            onClick={() => setOpts({ ...opts, camera: !opts.camera })}
                            iconOn={<Camera className="w-3 h-3" />}
                            iconOff={<CameraOff className="w-3 h-3" />}
                            label="Camera"
                            dataTestId="toggle-camera"
                        />
                        <OptionToggle
                            on={opts.systemAudio}
                            onClick={() => setOpts({ ...opts, systemAudio: !opts.systemAudio })}
                            iconOn={<Volume2 className="w-3 h-3" />}
                            iconOff={<VolumeX className="w-3 h-3" />}
                            label="System Audio"
                            dataTestId="toggle-system-audio"
                        />
                    </div>
                    <Button type="button" onClick={startRecording} disabled={starting} className="w-full rounded-full" size="sm">
                        {starting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting...</> : 'Start Recording'}
                    </Button>
                </div>
            )}

            {recording && (
                <>
                    <div
                        className="fixed bottom-4 left-3 z-[2147483647] bg-slate-900/35 backdrop-blur-xl text-white rounded-full shadow-lg shadow-black/10 border border-white/20 flex items-center gap-2 pl-2.5 pr-1 py-1 select-none"
                        data-testid="attachment-recording-bar"
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-amber-300' : 'bg-rose-400 animate-pulse'}`} />
                        <span className="font-mono text-[11px] font-medium tabular-nums">{fmt(seconds)}</span>
                        <button
                            type="button"
                            onClick={pauseResume}
                            className="h-7 w-7 rounded-full text-white/90 hover:bg-white/15 inline-flex items-center justify-center"
                            title={paused ? 'Resume' : 'Pause'}
                        >
                            {paused ? <Play className="w-3 h-3" fill="currentColor" /> : <Pause className="w-3 h-3" />}
                        </button>
                        <button
                            type="button"
                            onClick={stopRecording}
                            className="h-7 px-2.5 rounded-full bg-rose-500/85 hover:bg-rose-400 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                            <Square className="w-3 h-3" fill="currentColor" /> Stop
                        </button>
                    </div>
                    {opts.camera && (
                        <div className="fixed top-4 right-4 z-[2147483646] w-20 h-20 rounded-full overflow-hidden border-2 border-white/70 shadow-lg bg-black/80">
                            <video
                                ref={cameraPreviewRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                </>
            )}

            {/* Preview Dialog */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Preview Your Recording</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {previewBlob && (
                            <video
                                src={URL.createObjectURL(previewBlob)}
                                controls
                                className="w-full rounded-lg bg-black"
                            />
                        )}
                        <div className="flex gap-3 justify-end">
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
                                className="rounded-full bg-green-600 hover:bg-green-700"
                            >
                                <Play className="w-4 h-4 mr-2" />
                                Save Recording
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

            {attachments.length > 0 && (
                <div className="space-y-2">
                    {attachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between gap-2 bg-teal-50 border border-teal-200 p-2 rounded-xl text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                {iconFor(att.kind)}
                                <span className="truncate">{att.filename}</span>
                            </div>
                            <button type="button" onClick={() => removeAttachment(att.id)} className="text-red-500 hover:bg-red-100 rounded-full p-1 shrink-0">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AttachmentPicker;
