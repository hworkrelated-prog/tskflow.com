import React, { useEffect, useState, useRef } from 'react';
import { Square, Pause, Play, Mic, MicOff, Camera, CameraOff, RotateCcw } from 'lucide-react';

/*
 * Loom-style recording controls popup — compact OS window that floats above
 * the recorded surface. Driven by window.opener.__tskRecorderApi.
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

    useEffect(() => {
        document.title = 'Recording';
        try {
            document.documentElement.style.background = '#0f172a';
            document.body.style.background = '#0f172a';
            document.body.style.margin = '0';
            document.body.style.overflow = 'hidden';
        } catch { /* noop */ }

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
                        try { window.close(); } catch { /* noop */ }
                    }
                }
            } catch { setDetached(true); }
        };
        tickRef.current = setInterval(tick, 250);
        tick();
        return () => { if (tickRef.current) clearInterval(tickRef.current); };
    }, []);

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const handleStop = () => { callOpener('stop'); setTimeout(() => { try { window.close(); } catch { /* noop */ } }, 300); };
    const handlePause = () => callOpener('pauseResume');
    const handleRestart = () => callOpener('restart');
    const handleMic = () => callOpener('toggleMic');
    const handleCam = () => callOpener('toggleCam');
    const handleTask = () => { callOpener('startTask'); };

    const IconBtn = ({ onClick, title, active, testId, children }) => (
        <button
            type="button"
            onClick={onClick}
            title={title}
            data-testid={testId}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                active ? 'bg-white/20 text-white' : 'text-white/85 hover:bg-white/15'
            }`}
        >
            {children}
        </button>
    );

    return (
        <div className="min-h-screen bg-slate-900 text-white select-none flex items-center px-2" data-testid="recording-controls-popup">
            <div className="w-full flex items-center gap-1.5 rounded-full bg-slate-950/60 border border-white/10 px-2 py-1.5 shadow-xl">
                <div className="flex items-center gap-2 pr-2.5 border-r border-white/10 mr-0.5 min-w-[88px]">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${paused ? 'bg-amber-400' : 'bg-rose-500 animate-pulse'}`} />
                    <div className="leading-tight">
                        <div className="text-[9px] uppercase tracking-wider text-white/45">{paused ? 'Paused' : 'Rec'}</div>
                        <div className="font-mono font-semibold text-sm tabular-nums" data-testid="popup-timer">{fmt(seconds)}</div>
                    </div>
                </div>

                <IconBtn onClick={handlePause} title={paused ? 'Resume' : 'Pause'} active={paused} testId="popup-pause-btn">
                    {paused ? <Play className="w-4 h-4" fill="currentColor" /> : <Pause className="w-4 h-4" fill="currentColor" />}
                </IconBtn>
                <IconBtn onClick={handleRestart} title="Restart" testId="popup-restart-btn">
                    <RotateCcw className="w-4 h-4" />
                </IconBtn>
                <IconBtn onClick={handleMic} title={micOn ? 'Mute mic' : 'Unmute'} active={!micOn} testId="popup-mic-btn">
                    {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 opacity-70" />}
                </IconBtn>
                <IconBtn onClick={handleCam} title={camOn ? 'Hide cam' : 'Show cam'} active={!camOn} testId="popup-cam-btn">
                    {camOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4 opacity-70" />}
                </IconBtn>

                <button
                    type="button"
                    onClick={handleTask}
                    className="ml-1 h-9 px-3 rounded-full bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                    data-testid="popup-task-btn"
                    title="Create a task with this recording"
                >
                    Task
                </button>
                <button
                    type="button"
                    onClick={handleStop}
                    className="ml-0.5 h-9 px-3.5 rounded-full bg-rose-500 hover:bg-rose-400 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                    data-testid="popup-stop-btn"
                >
                    <Square className="w-3.5 h-3.5" fill="currentColor" /> Stop
                </button>
            </div>
            {detached && (
                <p className="absolute bottom-1 left-2 right-2 text-[10px] text-amber-300">
                    Lost connection — stop from the main tab.
                </p>
            )}
        </div>
    );
};

export default RecordingControlsPopup;
