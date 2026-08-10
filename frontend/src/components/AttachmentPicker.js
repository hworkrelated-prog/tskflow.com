import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Paperclip, Video, Square, X, Loader2, Video as VideoIcon, FileText, Image as ImageIcon, Mic, MicOff, Camera, CameraOff, Volume2, VolumeX, Play, Trash2, RotateCw } from 'lucide-react';
import { uploadBlob } from '@/lib/upload';
import { pickRecorderMimeType, extForMime, mediaErrorMessage, canRecordScreen } from '@/lib/mediaRecorder';

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

    useEffect(() => {
        return () => {
            cleanupStreams();
        };
    }, []);

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
            toast.error(e?.message || `Failed to upload ${filename}`);
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

            const useCamera = !!cameraStream;
            let videoTrackForRecording;
            let cameraVideoEl = null;
            let screenVideoEl = null;
            let canvas = null;

            if (useCamera) {
                screenVideoEl = document.createElement('video');
                screenVideoEl.srcObject = screenStream;
                screenVideoEl.muted = true;
                await screenVideoEl.play().catch(() => {});
                cameraVideoEl = document.createElement('video');
                cameraVideoEl.srcObject = cameraStream;
                cameraVideoEl.muted = true;
                await cameraVideoEl.play().catch(() => {});

                await new Promise((res) => {
                    if (screenVideoEl.readyState >= 1) res();
                    else screenVideoEl.onloadedmetadata = () => res();
                });

                canvas = document.createElement('canvas');
                canvas.width = screenVideoEl.videoWidth || 1280;
                canvas.height = screenVideoEl.videoHeight || 720;
                canvasRef.current = canvas;
                videoRefs.current = { screen: screenVideoEl, camera: cameraVideoEl };

                const ctx = canvas.getContext('2d', { alpha: false }); // Fixed: disable alpha for better performance
                let lastDrawTime = 0;
                const targetFPS = 30;
                const frameInterval = 1000 / targetFPS;

                const draw = (currentTime) => {
                    // Fixed: throttle drawing to exact 30fps to prevent lag
                    if (currentTime - lastDrawTime < frameInterval) {
                        rafRef.current = requestAnimationFrame(draw);
                        return;
                    }
                    lastDrawTime = currentTime;

                    try {
                        ctx.drawImage(screenVideoEl, 0, 0, canvas.width, canvas.height);
                        const bubbleD = Math.round(canvas.width * 0.18);
                        const margin = Math.round(canvas.width * 0.02);
                        const x = canvas.width - bubbleD - margin;
                        const y = canvas.height - bubbleD - margin;
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(x + bubbleD / 2, y + bubbleD / 2, bubbleD / 2, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        const cw = cameraVideoEl.videoWidth || 640;
                        const ch = cameraVideoEl.videoHeight || 480;
                        const scale = Math.max(bubbleD / cw, bubbleD / ch);
                        const dw = cw * scale;
                        const dh = ch * scale;
                        ctx.drawImage(cameraVideoEl, x + (bubbleD - dw) / 2, y + (bubbleD - dh) / 2, dw, dh);
                        ctx.restore();
                        ctx.beginPath();
                        ctx.arc(x + bubbleD / 2, y + bubbleD / 2, bubbleD / 2, 0, Math.PI * 2);
                        ctx.lineWidth = Math.max(2, Math.round(bubbleD * 0.03));
                        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                        ctx.stroke();
                    } catch (_) { /* ignore per-frame errors */ }
                    rafRef.current = requestAnimationFrame(draw);
                };
                draw(0);
                videoTrackForRecording = canvas.captureStream(30).getVideoTracks()[0];
            } else {
                videoTrackForRecording = screenStream.getVideoTracks()[0];
            }

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

            if (!canRecordScreen()) {
                toast.error('Screen recording is not supported in this browser. Please use Chrome, Edge, or Firefox.');
                cleanupStreams();
                return;
            }
            const mimeType = pickRecorderMimeType();
            let rec;
            try {
                rec = new MediaRecorder(composed, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_500_000 });
            } catch {
                try { rec = new MediaRecorder(composed); }
                catch {
                    toast.error('This browser cannot record the selected screen. Try Chrome or Edge.');
                    cleanupStreams();
                    return;
                }
            }
            const resolvedMime = rec.mimeType || mimeType || 'video/webm';
            recorderRef.current = rec;
            chunksRef.current = [];
            rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
            rec.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                setRecording(false);
                setSeconds(0);
                const blob = new Blob(chunksRef.current, { type: resolvedMime });
                cleanupStreams();
                if (blob.size > 0) {
                    // Show preview instead of auto-uploading
                    setPreviewBlob(blob);
                    setShowPreview(true);
                } else {
                    toast.error('Recording was empty — try again');
                }
            };
            rec.onerror = (ev) => {
                toast.error(ev?.error?.message || 'Recording error — please try again');
                cleanupStreams();
                setRecording(false);
                setSeconds(0);
            };
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                    try { recorderRef.current.requestData?.(); } catch { /* noop */ }
                    recorderRef.current.stop();
                }
            });
            rec.start(1000);
            setRecording(true);
            setShowOptions(false);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

            if (useCamera && cameraPreviewRef.current) {
                cameraPreviewRef.current.srcObject = cameraStream;
                cameraPreviewRef.current.play().catch(() => {});
            }
        } catch (e) {
            cleanupStreams();
            toast.error(mediaErrorMessage(e, 'screen'));
        } finally {
            setStarting(false);
        }
    };

    const stopRecording = () => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            try { recorderRef.current.requestData?.(); } catch { /* noop */ }
            recorderRef.current.stop();
        }
    };

    const handleSaveRecording = async () => {
        if (previewBlob) {
            const ext = extForMime(previewBlob.type);
            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            await doUpload(previewBlob, `screen-recording-${stamp}.${ext}`, previewBlob.type || 'video/webm');
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
                <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
                    {/* Floating controls */}
                    <div className="bg-red-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
                        <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                        <span className="font-mono font-bold text-lg">{fmt(seconds)}</span>
                        <Button
                            type="button"
                            size="sm"
                            onClick={stopRecording}
                            className="bg-white text-red-600 hover:bg-gray-100 rounded-full ml-2"
                        >
                            <Square className="w-4 h-4 mr-1" />
                            Stop
                        </Button>
                    </div>
                    
                    {/* Live camera preview */}
                    {opts.camera && (
                        <div className="bg-black rounded-xl overflow-hidden shadow-2xl w-48 h-36">
                            <video
                                ref={cameraPreviewRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                </div>
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
