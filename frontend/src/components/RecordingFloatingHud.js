import React, { useEffect, useRef, useState } from 'react';
import { Square, Pause, Play, RotateCcw, Mic, MicOff, Camera, CameraOff, Move, Plus } from 'lucide-react';

const CtrlBtn = ({ onClick, title, active, danger, children, testId }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        data-testid={testId}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            danger
                ? 'bg-rose-500/90 hover:bg-rose-400 text-white'
                : active
                    ? 'bg-white/25 text-white'
                    : 'text-white/80 hover:bg-white/15 hover:text-white'
        }`}
    >
        {children}
    </button>
);

/**
 * Loom-style movable HUD: camera bubble + recording controls on one surface.
 * Used in-tab when Document PiP is not needed / unavailable.
 */
export const RecordingFloatingHud = ({
    seconds = 0,
    paused = false,
    micOn = true,
    camOn = true,
    cameraStream = null,
    showCamera = true,
    showTask = false,
    onPauseResume,
    onRestart,
    onToggleMic,
    onToggleCam,
    onStop,
    onStartTask,
    storageKey = 'tsk_rec_hud_pos',
}) => {
    const clampPos = (p) => {
        const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
        const h = typeof window !== 'undefined' ? window.innerHeight : 768;
        const panelW = showCamera && camOn && cameraStream ? 320 : 280;
        const panelH = showCamera && camOn && cameraStream ? 118 : 52;
        return {
            x: Math.max(8, Math.min(w - panelW, p?.x ?? 12)),
            y: Math.max(8, Math.min(h - panelH, p?.y ?? (h - 72))),
        };
    };

    const [pos, setPos] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            const h = typeof window !== 'undefined' ? window.innerHeight : 768;
            return clampPos(saved || { x: 12, y: h - 72 });
        } catch {
            const h = typeof window !== 'undefined' ? window.innerHeight : 768;
            return clampPos({ x: 12, y: h - 72 });
        }
    });

    useEffect(() => {
        const onResize = () => setPos((p) => clampPos(p));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showCamera, camOn, cameraStream]);

    const start = useRef(null);
    const posRef = useRef(pos);
    posRef.current = pos;
    const videoRef = useRef(null);

    useEffect(() => {
        const v = videoRef.current;
        if (!v || !cameraStream) return undefined;
        v.srcObject = cameraStream;
        const play = () => v.play().catch(() => {});
        v.onloadedmetadata = play;
        play();
        return undefined;
    }, [cameraStream, camOn]);

    const onDown = (e) => {
        const evt = e.touches ? e.touches[0] : e;
        start.current = { x: evt.clientX - posRef.current.x, y: evt.clientY - posRef.current.y };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
    };
    const onMove = (e) => {
        if (!start.current) return;
        if (e.cancelable) e.preventDefault?.();
        const evt = e.touches ? e.touches[0] : e;
        setPos(clampPos({
            x: evt.clientX - start.current.x,
            y: evt.clientY - start.current.y,
        }));
    };
    const onUp = () => {
        try { localStorage.setItem(storageKey, JSON.stringify(posRef.current)); } catch { /* noop */ }
        start.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchend', onUp);
    };

    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const showBubble = showCamera && cameraStream && camOn;

    return (
        <div
            style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 2147483647 }}
            className="bg-slate-900/90 backdrop-blur-xl text-white rounded-2xl shadow-2xl shadow-black/30 border border-white/25 flex items-center gap-2.5 pl-2 pr-2 py-2 select-none"
            data-testid="recording-floating-bar"
        >
            {showBubble && (
                <div
                    className="w-[72px] h-[72px] rounded-full overflow-hidden border-2 border-white/80 shadow-md bg-black shrink-0 cursor-grab active:cursor-grabbing"
                    onMouseDown={onDown}
                    onTouchStart={onDown}
                    title="Drag"
                    data-testid="recording-camera-bubble"
                >
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                        style={{ transform: 'scaleX(-1)' }}
                    />
                </div>
            )}
            <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-1.5">
                    <div
                        className="cursor-grab active:cursor-grabbing p-1 text-white/40 hover:text-white/75"
                        onMouseDown={onDown}
                        onTouchStart={onDown}
                        title="Drag"
                    >
                        <Move className="w-3 h-3" />
                    </div>
                    <span className={`w-1.5 h-1.5 rounded-full ${paused ? 'bg-amber-300' : 'bg-rose-400 animate-pulse'}`} />
                    <span className="font-mono text-[11px] font-medium tabular-nums tracking-wide text-white/95" data-testid="recording-timer">{fmt(seconds)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                    <CtrlBtn onClick={onPauseResume} title={paused ? 'Resume' : 'Pause'} active={paused}>
                        {paused ? <Play className="w-3.5 h-3.5" fill="currentColor" /> : <Pause className="w-3.5 h-3.5" />}
                    </CtrlBtn>
                    {onRestart && (
                        <CtrlBtn onClick={onRestart} title="Restart">
                            <RotateCcw className="w-3.5 h-3.5" />
                        </CtrlBtn>
                    )}
                    {onToggleMic && (
                        <CtrlBtn onClick={onToggleMic} title={micOn ? 'Mute mic' : 'Unmute mic'} active={!micOn}>
                            {micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 opacity-70" />}
                        </CtrlBtn>
                    )}
                    {onToggleCam && showCamera && (
                        <CtrlBtn onClick={onToggleCam} title={camOn ? 'Hide webcam' : 'Show webcam'} active={!camOn}>
                            {camOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5 opacity-70" />}
                        </CtrlBtn>
                    )}
                    {showTask && onStartTask && (
                        <button
                            type="button"
                            onClick={onStartTask}
                            className="ml-0.5 h-7 px-2.5 rounded-full bg-teal-600/90 hover:bg-teal-500 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                            data-testid="recording-start-task-btn"
                            title="Open the AI task bar - recording attaches when you stop"
                        >
                            <Plus className="w-3 h-3" /> Task
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onStop}
                        className="ml-0.5 h-7 px-2.5 rounded-full bg-rose-500/85 hover:bg-rose-400 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                        data-testid="stop-recording-btn"
                    >
                        <Square className="w-3 h-3" fill="currentColor" /> Stop
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecordingFloatingHud;
