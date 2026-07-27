import React, { useEffect, useState, useRef } from 'react';
import { Video, Square, Pause, Play, Mic, MicOff, Camera, CameraOff, RotateCcw } from 'lucide-react';

/*
 * Recording Controls Popup — opens as a small always-on-top-ish window (350x110).
 * It is used because the browser's floating bar in the RECORDER TAB overlaps the
 * recorded content when the user picks "This tab" as the source. Opening a small
 * separate window ("popup=1" size) causes Chrome/Firefox to render it as a top-level
 * OS window rather than a new tab — so it visually floats over any content the user
 * is recording (unless they picked "Entire screen", in which case it's still captured).
 *
 * Communication with the opener tab is done via window.opener.__tskRecorderApi.
 */
const RecordingControlsPopup = () => {
    const [seconds, setSeconds] = useState(0);
    const [paused, setPaused] = useState(false);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [detached, setDetached] = useState(false);
    const tickRef = useRef(null);

    const callOpener = (fn, ...args) => {
        try {
            const api = window.opener && window.opener.__tskRecorderApi;
            if (!api || typeof api[fn] !== 'function') return null;
            return api[fn](...args);
        } catch { return null; }
    };

    // Poll opener state — timer, paused, micOn, camOn, recording?
    useEffect(() => {
        const tick = () => {
            try {
                const api = window.opener && window.opener.__tskRecorderApi;
                if (!api) { setDetached(true); return; }
                setDetached(false);
                const s = api.getState ? api.getState() : null;
                if (s) {
                    setSeconds(s.seconds || 0);
                    setPaused(!!s.paused);
                    setMicOn(!!s.micOn);
                    setCamOn(!!s.camOn);
                    if (!s.recording) {
                        // Recording has stopped → close popup
                        try { window.close(); } catch { /* noop */ }
                    }
                }
            } catch { setDetached(true); }
        };
        tickRef.current = setInterval(tick, 500);
        tick();
        return () => { if (tickRef.current) clearInterval(tickRef.current); };
    }, []);

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const handleStop = () => { callOpener('stop'); setTimeout(() => { try { window.close(); } catch { /* noop */ } }, 300); };
    const handlePause = () => callOpener('pauseResume');
    const handleRestart = () => callOpener('restart');
    const handleMic = () => callOpener('toggleMic');
    const handleCam = () => callOpener('toggleCam');

    return (
        <div className="min-h-screen bg-gray-900 text-white p-2 select-none" data-testid="recording-controls-popup">
            <div className="flex items-center gap-2 h-full">
                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                    <Video className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-red-300">{paused ? 'Paused' : 'Recording'}</div>
                    <div className="font-mono font-bold text-lg tabular-nums" data-testid="popup-timer">{fmt(seconds)}</div>
                </div>
                <button onClick={handlePause} title={paused ? 'Resume' : 'Pause'} className="p-2 rounded-lg hover:bg-white/10" data-testid="popup-pause-btn">
                    {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button onClick={handleRestart} title="Restart" className="p-2 rounded-lg hover:bg-white/10" data-testid="popup-restart-btn">
                    <RotateCcw className="w-4 h-4" />
                </button>
                <button onClick={handleMic} title={micOn ? 'Mute mic' : 'Unmute'} className="p-2 rounded-lg hover:bg-white/10" data-testid="popup-mic-btn">
                    {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 opacity-50" />}
                </button>
                <button onClick={handleCam} title={camOn ? 'Hide cam' : 'Show cam'} className="p-2 rounded-lg hover:bg-white/10" data-testid="popup-cam-btn">
                    {camOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4 opacity-50" />}
                </button>
                <button onClick={handleStop} className="bg-white text-red-600 px-3 py-1.5 rounded-lg font-semibold text-sm ml-1 hover:bg-gray-100" data-testid="popup-stop-btn">
                    <Square className="w-4 h-4 inline mr-1" /> Stop
                </button>
            </div>
            {detached && (
                <p className="text-[10px] text-amber-300 mt-1 px-1">Lost connection to recorder — please stop from the main tab.</p>
            )}
        </div>
    );
};

export default RecordingControlsPopup;
