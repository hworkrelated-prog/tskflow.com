import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Paperclip, Video, Square, X, Loader2, Video as VideoIcon, FileText, Image as ImageIcon, Mic, MicOff, Camera, CameraOff, Volume2, VolumeX } from 'lucide-react';
import { uploadBlob } from '@/lib/upload';

const iconFor = (kind) => {
    if (kind === 'video') return <VideoIcon className="w-4 h-4 text-indigo-500" />;
    if (kind === 'image') return <ImageIcon className="w-4 h-4 text-indigo-500" />;
    return <FileText className="w-4 h-4 text-indigo-500" />;
};

const OptionToggle = ({ on, onClick, iconOn, iconOff, label, dataTestId }) => (
    <button
        type="button"
        onClick={onClick}
        data-testid={dataTestId}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
    >
        {on ? iconOn : iconOff}
        {label}
    </button>
);

export const AttachmentPicker = ({ attachments, setAttachments }) => {
    const fileInputRef = useRef(null);
    const [uploads, setUploads] = useState({}); // tempId -> {name, progress}
    const [recording, setRecording] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [starting, setStarting] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [opts, setOpts] = useState({ mic: true, camera: true, systemAudio: true });
    const [permissionState, setPermissionState] = useState({ mic: null, camera: null });

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

    // Ask for mic + camera up-front so Chrome shows its native permission prompts BEFORE
    // the screen share picker — this gives users the familiar Loom-style flow.
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
            // 1) Ask for mic/camera FIRST so Chrome shows its native permission prompt(s)
            const { mic: micStream, camera: cameraStream } = await requestMediaPermissions();
            streamsRef.current.mic = micStream;
            streamsRef.current.camera = cameraStream;

            // 2) Ask for screen (Chrome share picker) — request tab/system audio if the user toggled it on
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: opts.systemAudio,
            });
            streamsRef.current.screen = screenStream;

            const useCamera = !!cameraStream;
            let videoTrackForRecording;
            let cameraVideoEl = null;
            let screenVideoEl = null;
            let canvas = null;

            if (useCamera) {
                // Compose screen + small camera bubble in bottom-right via canvas
                screenVideoEl = document.createElement('video');
                screenVideoEl.srcObject = screenStream;
                screenVideoEl.muted = true;
                await screenVideoEl.play().catch(() => {});
                cameraVideoEl = document.createElement('video');
                cameraVideoEl.srcObject = cameraStream;
                cameraVideoEl.muted = true;
                await cameraVideoEl.play().catch(() => {});

                // Wait for metadata
                await new Promise((res) => {
                    if (screenVideoEl.readyState >= 1) res();
                    else screenVideoEl.onloadedmetadata = () => res();
                });

                canvas = document.createElement('canvas');
                canvas.width = screenVideoEl.videoWidth || 1280;
                canvas.height = screenVideoEl.videoHeight || 720;
                canvasRef.current = canvas;
                videoRefs.current = { screen: screenVideoEl, camera: cameraVideoEl };

                const ctx = canvas.getContext('2d');
                const draw = () => {
                    try {
                        ctx.drawImage(screenVideoEl, 0, 0, canvas.width, canvas.height);
                        // Camera bubble: circular, 18% width, bottom-right
                        const bubbleD = Math.round(canvas.width * 0.18);
                        const margin = Math.round(canvas.width * 0.02);
                        const x = canvas.width - bubbleD - margin;
                        const y = canvas.height - bubbleD - margin;
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(x + bubbleD / 2, y + bubbleD / 2, bubbleD / 2, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        // Cover-fit the camera into the circle
                        const cw = cameraVideoEl.videoWidth || 640;
                        const ch = cameraVideoEl.videoHeight || 480;
                        const scale = Math.max(bubbleD / cw, bubbleD / ch);
                        const dw = cw * scale;
                        const dh = ch * scale;
                        ctx.drawImage(cameraVideoEl, x + (bubbleD - dw) / 2, y + (bubbleD - dh) / 2, dw, dh);
                        ctx.restore();
                        // White ring around the bubble
                        ctx.beginPath();
                        ctx.arc(x + bubbleD / 2, y + bubbleD / 2, bubbleD / 2, 0, Math.PI * 2);
                        ctx.lineWidth = Math.max(2, Math.round(bubbleD * 0.03));
                        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                        ctx.stroke();
                    } catch (_) { /* ignore per-frame errors */ }
                    rafRef.current = requestAnimationFrame(draw);
                };
                draw();
                videoTrackForRecording = canvas.captureStream(30).getVideoTracks()[0];
            } else {
                videoTrackForRecording = screenStream.getVideoTracks()[0];
            }

            // 3) Mix audio: system audio (from screen) + mic (Web Audio API)
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

            // 4) Compose the final recording stream and start the recorder
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
                setSeconds(0);
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                cleanupStreams();
                if (blob.size > 0) {
                    await doUpload(blob, `screen-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`, 'video/webm');
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
            // If the user stops the screen share from browser UI, end the recording
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
            });
            rec.start(1000); // chunk every 1s so recording continues past initial buffer
            setRecording(true);
            setShowOptions(false);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

            // Bind live camera preview to the on-screen preview element (best-effort)
            if (useCamera && cameraPreviewRef.current) {
                cameraPreviewRef.current.srcObject = cameraStream;
                cameraPreviewRef.current.play().catch(() => {});
            }
        } catch (e) {
            cleanupStreams();
            if (e && e.name !== 'NotAllowedError') {
                console.error(e);
                toast.error('Could not start screen recording');
            }
        } finally {
            setStarting(false);
        }
    };

    const stopRecording = () => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    };

    const removeAttachment = (id) => setAttachments((prev) => prev.filter((a) => a.id !== id));

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const uploadList = Object.entries(uploads);

    return (
        <div className="space-y-3" data-testid="attachment-picker">
            <div className="flex flex-wrap items-center gap-2">
                <input ref={fileInputRef} type="file" multiple onChange={handleFiles} className="hidden" data-testid="attach-file-input" />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="rounded-full" data-testid="attach-file-button">
                    <Paperclip className="w-4 h-4 mr-2" /> Attach files
                </Button>
                {!recording ? (
                    <>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowOptions((v) => !v)} className="rounded-full" data-testid="record-screen-button">
                            <Video className="w-4 h-4 mr-2" /> Record screen
                        </Button>
                    </>
                ) : (
                    <Button type="button" variant="destructive" size="sm" onClick={stopRecording} className="rounded-full animate-pulse" data-testid="stop-recording-button">
                        <Square className="w-4 h-4 mr-2" /> Stop recording · {fmt(seconds)}
                    </Button>
                )}
            </div>

            {/* Loom-style pre-recording controls */}
            {!recording && showOptions && (
                <div className="p-3 rounded-xl border bg-slate-50 space-y-2" data-testid="record-options-panel">
                    <p className="text-xs font-medium text-gray-700">Choose what to include, then start recording</p>
                    <div className="flex flex-wrap gap-2">
                        <OptionToggle
                            on={opts.mic}
                            onClick={() => setOpts((o) => ({ ...o, mic: !o.mic }))}
                            iconOn={<Mic className="w-3.5 h-3.5" />}
                            iconOff={<MicOff className="w-3.5 h-3.5" />}
                            label={opts.mic ? 'Mic on' : 'Mic off'}
                            dataTestId="toggle-mic"
                        />
                        <OptionToggle
                            on={opts.camera}
                            onClick={() => setOpts((o) => ({ ...o, camera: !o.camera }))}
                            iconOn={<Camera className="w-3.5 h-3.5" />}
                            iconOff={<CameraOff className="w-3.5 h-3.5" />}
                            label={opts.camera ? 'Camera on' : 'Camera off'}
                            dataTestId="toggle-camera"
                        />
                        <OptionToggle
                            on={opts.systemAudio}
                            onClick={() => setOpts((o) => ({ ...o, systemAudio: !o.systemAudio }))}
                            iconOn={<Volume2 className="w-3.5 h-3.5" />}
                            iconOff={<VolumeX className="w-3.5 h-3.5" />}
                            label={opts.systemAudio ? 'System audio' : 'No system audio'}
                            dataTestId="toggle-system-audio"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                        <p className="text-[11px] text-gray-500">Chrome will ask for mic/camera permission next.</p>
                        <Button type="button" size="sm" onClick={startRecording} disabled={starting} className="rounded-full">
                            {starting ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Starting…</> : <><Video className="w-3.5 h-3.5 mr-2" />Start recording</>}
                        </Button>
                    </div>
                </div>
            )}

            {/* Live camera preview bubble while recording */}
            {recording && opts.camera && permissionState.camera === 'granted' && (
                <div className="flex justify-end">
                    <video
                        ref={cameraPreviewRef}
                        muted
                        playsInline
                        className="w-24 h-24 rounded-full object-cover border-2 border-white shadow-lg bg-black"
                        data-testid="camera-preview"
                    />
                </div>
            )}

            {(uploadList.length > 0 || attachments.length > 0) && (
                <div className="space-y-2">
                    {attachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-slate-50 text-sm" data-testid={`attachment-chip-${att.id}`}>
                            <span className="flex items-center gap-2 truncate">{iconFor(att.kind)}{att.original_filename}</span>
                            <button type="button" onClick={() => removeAttachment(att.id)} className="text-red-500 hover:bg-red-50 rounded-full p-1 shrink-0"><X className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                    {uploadList.map(([id, u]) => (
                        <div key={id} className="flex items-center gap-2 p-2 rounded-lg border bg-indigo-50 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" />
                            <span className="truncate flex-1">{u.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{u.progress}%</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AttachmentPicker;
