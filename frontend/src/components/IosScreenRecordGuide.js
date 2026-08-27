import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Video, Image as ImageIcon, Camera, Loader2 } from 'lucide-react';

/**
 * iPhone/iPad browsers cannot use getDisplayMedia. Guide Control Center
 * screen recording, then attach the video from Photos.
 */
export default function IosScreenRecordGuide({
    open,
    onOpenChange,
    onPickVideo,
    onStartCameraWalkthrough,
    attaching = false,
}) {
    const inputRef = useRef(null);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-2xl" data-testid="ios-screen-record-guide">
                <DialogHeader>
                    <DialogTitle style={{ fontFamily: 'Outfit, sans-serif' }}>Record this iPhone</DialogTitle>
                    <DialogDescription>
                        Safari can&apos;t capture the screen inside the browser. Use iOS Screen Recording, then attach the video here.
                    </DialogDescription>
                </DialogHeader>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
                    <li>Swipe to Control Center and tap the Screen Recording button (dotted circle).</li>
                    <li>Do the walkthrough on your phone.</li>
                    <li>Stop from the red status bar, then attach the clip from Photos.</li>
                </ol>
                <input
                    ref={inputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/*,.mov,.mp4"
                    className="hidden"
                    data-testid="ios-screen-record-file"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) onPickVideo?.(file);
                    }}
                />
                <div className="flex flex-col gap-2 pt-1">
                    <Button
                        type="button"
                        className="rounded-full"
                        disabled={attaching}
                        data-testid="ios-attach-recording-btn"
                        onClick={() => inputRef.current?.click()}
                    >
                        {attaching
                            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            : <ImageIcon className="w-4 h-4 mr-2" />}
                        {attaching ? 'Attaching…' : 'Attach screen recording'}
                    </Button>
                    {typeof onStartCameraWalkthrough === 'function' && (
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-full"
                            data-testid="ios-camera-walkthrough-btn"
                            onClick={onStartCameraWalkthrough}
                        >
                            <Camera className="w-4 h-4 mr-2" />
                            Record a camera walkthrough
                        </Button>
                    )}
                    <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
                        <Video className="w-3 h-3" />
                        Screen Recordings live in Photos → Recents
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
