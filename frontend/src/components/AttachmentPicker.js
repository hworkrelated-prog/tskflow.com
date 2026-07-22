import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Paperclip, Video, Square, X, Loader2, Video as VideoIcon, FileText, Image as ImageIcon } from 'lucide-react';
import { uploadBlob } from '@/lib/upload';

const iconFor = (kind) => {
    if (kind === 'video') return <VideoIcon className="w-4 h-4 text-indigo-500" />;
    if (kind === 'image') return <ImageIcon className="w-4 h-4 text-indigo-500" />;
    return <FileText className="w-4 h-4 text-indigo-500" />;
};

export const AttachmentPicker = ({ attachments, setAttachments }) => {
    const fileInputRef = useRef(null);
    const [uploads, setUploads] = useState({}); // tempId -> {name, progress}
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        };
    }, []);

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

    const startRecording = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            toast.error('Screen recording is not supported in this browser. Try Chrome.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: true,
            });
            streamRef.current = stream;
            chunksRef.current = [];
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
            const rec = new MediaRecorder(stream, { mimeType });
            recorderRef.current = rec;
            rec.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data); };
            rec.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                setRecording(false);
                setSeconds(0);
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                if (blob.size > 0) {
                    await doUpload(blob, `screen-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`, 'video/webm');
                } else {
                    toast.error('Recording was empty — try again');
                }
            };
            rec.onerror = (ev) => {
                console.error('MediaRecorder error', ev);
                toast.error('Recording error — please try again');
                try { stream.getTracks().forEach((t) => t.stop()); } catch(_) {}
                if (timerRef.current) clearInterval(timerRef.current);
                setRecording(false);
                setSeconds(0);
            };
            // If the user stops sharing via the browser UI, end the recording
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
            });
            // Collect chunks every 1s so the recording continues past the initial buffer
            // (some browsers stop delivering data without a timeslice when the tab is inactive)
            rec.start(1000);
            setRecording(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        } catch (e) {
            if (e && e.name !== 'NotAllowedError') toast.error('Could not start screen recording');
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
                    <Button type="button" variant="outline" size="sm" onClick={startRecording} className="rounded-full" data-testid="record-screen-button">
                        <Video className="w-4 h-4 mr-2" /> Record screen
                    </Button>
                ) : (
                    <Button type="button" variant="destructive" size="sm" onClick={stopRecording} className="rounded-full animate-pulse" data-testid="stop-recording-button">
                        <Square className="w-4 h-4 mr-2" /> Stop recording · {fmt(seconds)}
                    </Button>
                )}
            </div>

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
