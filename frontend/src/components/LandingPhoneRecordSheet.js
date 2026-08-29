import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Image as ImageIcon, Smartphone, Video } from 'lucide-react';
import { isAppleMobile } from '@/lib/recordingCapabilities';

/**
 * Phones (especially iPhone Safari) cannot use getDisplayMedia. Offer camera
 * recording, a Photos/gallery pick, the native camera app, and a Control Center hint.
 */
export default function LandingPhoneRecordSheet({
    open,
    onOpenChange,
    onStartCamera,
    onPickFile,
    starting = false,
}) {
    const galleryRef = useRef(null);
    const captureRef = useRef(null);
    const apple = isAppleMobile();

    const takeFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) onPickFile?.(file);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="landing-phone-record max-w-md rounded-t-2xl sm:rounded-2xl border-white/12 bg-[#0c1210] text-white"
                data-testid="landing-phone-record-sheet"
            >
                <DialogHeader>
                    <DialogTitle className="text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        Record on this phone
                    </DialogTitle>
                    <DialogDescription className="text-white/55">
                        This browser can&apos;t capture the screen inside the page. Record with the camera, or attach a clip from Photos.
                    </DialogDescription>
                </DialogHeader>

                <ol className="text-sm text-white/70 space-y-2 list-decimal pl-5" data-testid="landing-phone-record-hint">
                    {apple ? (
                        <>
                            <li>Swipe to Control Center and tap Screen Recording (dotted circle).</li>
                            <li>Do the walkthrough, stop from the red status bar, then attach the clip from Photos.</li>
                        </>
                    ) : (
                        <>
                            <li>Use the phone&apos;s screen recorder, or film with the camera.</li>
                            <li>Then attach the clip from Photos / gallery.</li>
                        </>
                    )}
                </ol>

                <input
                    ref={galleryRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/*,.mov,.mp4"
                    className="hidden"
                    data-testid="landing-phone-record-file"
                    onChange={takeFile}
                />
                <input
                    ref={captureRef}
                    type="file"
                    accept="video/*"
                    capture="environment"
                    className="hidden"
                    data-testid="landing-phone-record-capture-input"
                    onChange={takeFile}
                />

                <div className="flex flex-col gap-2 pt-1">
                    <Button
                        type="button"
                        className="rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 h-11"
                        disabled={starting}
                        data-testid="landing-phone-record-camera"
                        onClick={onStartCamera}
                    >
                        <Camera className="w-4 h-4 mr-2" />
                        {starting ? 'Starting…' : 'Record with camera'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-white/20 bg-white/[0.04] text-white hover:bg-white/10 h-11"
                        data-testid="landing-phone-record-photos"
                        onClick={() => galleryRef.current?.click()}
                    >
                        <ImageIcon className="w-4 h-4 mr-2" />
                        Choose from Photos
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full text-white/70 hover:text-white hover:bg-white/10 h-10"
                        data-testid="landing-phone-record-capture"
                        onClick={() => captureRef.current?.click()}
                    >
                        <Smartphone className="w-4 h-4 mr-2" />
                        Open Camera app
                    </Button>
                    <p className="text-[11px] text-white/40 text-center flex items-center justify-center gap-1 pt-1">
                        <Video className="w-3 h-3" />
                        Screen recordings live in Photos → Recents
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
