import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Video, Square, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBlob } from '@/lib/upload';
import axios from 'axios';
import { API } from '@/App';

export const StandaloneRecorder = () => {
    const [recording, setRecording] = useState(false);
    const [starting, setStarting] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [showResult, setShowResult] = useState(false);
    const [shareableLink, setShareableLink] = useState('');
    const [copied, setCopied] = useState(false);

    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    const startRecording = async () => {
        setStarting(true);
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: true
            });
            streamRef.current = stream;

            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9,opus',
                videoBitsPerSecond: 2_500_000
            });
            recorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                if (timerRef.current) clearInterval(timerRef.current);
                setRecording(false);
                setSeconds(0);

                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                if (blob.size > 0) {
                    // Upload and create shareable link
                    const filename = `recording-${Date.now()}.webm`;
                    const ref = await uploadBlob(blob, filename, 'video/webm');
                    
                    const response = await axios.post(`${API}/recordings/standalone`, {
                        recording_url: ref.path
                    });
                    
                    setShareableLink(response.data.shareable_link);
                    setShowResult(true);
                    toast.success('Recording saved!');
                } else {
                    toast.error('Recording empty');
                }
                
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                }
            };

            stream.getVideoTracks()[0].addEventListener('ended', () => {
                if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
            });

            recorder.start(1000);
            setRecording(true);
            setSeconds(0);
            timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
        } catch (e) {
            if (e?.name !== 'NotAllowedError') {
                toast.error('Could not start recording');
            }
        } finally {
            setStarting(false);
        }
    };

    const stopRecording = () => {
        if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop();
    };

    const copyLink = () => {
        navigator.clipboard.writeText(shareableLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('Link copied!');
    };

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    return (
        <>
            {!recording && (
                <Button
                    variant="outline"
                    onClick={startRecording}
                    disabled={starting}
                    className="rounded-full"
                    size="sm"
                >
                    <Video className="w-4 h-4 mr-2" />
                    {starting ? 'Starting...' : 'Record Screen'}
                </Button>
            )}

            {recording && (
                <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                    <span className="font-mono font-bold text-lg">{fmt(seconds)}</span>
                    <Button
                        size="sm"
                        onClick={stopRecording}
                        className="bg-white text-red-600 hover:bg-gray-100 rounded-full ml-2"
                    >
                        <Square className="w-4 h-4 mr-1" />
                        Stop
                    </Button>
                </div>
            )}

            <Dialog open={showResult} onOpenChange={setShowResult}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Recording Ready</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <input
                                type="text"
                                value={shareableLink}
                                readOnly
                                className="flex-1 bg-transparent border-none outline-none text-sm"
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={copyLink}
                                className="shrink-0"
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Share this link with anyone. You can turn it into a task later.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default StandaloneRecorder;
