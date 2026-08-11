import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Play, Pause, Volume2, VolumeX, Maximize, Minimize,
    SkipBack, SkipForward, Settings2,
} from 'lucide-react';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const fmt = (secs) => {
    if (!Number.isFinite(secs) || secs < 0) return '0:00';
    const s = Math.floor(secs);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    return `${m}:${String(r).padStart(2, '0')}`;
};

/**
 * Loom-style custom video player — scrubber, skip, speed, volume, fullscreen.
 * Hides native controls; chrome fades in on hover / when paused.
 */
const LoomPlayer = ({
    src,
    autoPlay = false,
    className = '',
    videoClassName = 'max-h-[70vh]',
    onDuration,
    poster,
    'data-testid': testId = 'loom-player',
}) => {
    const wrapRef = useRef(null);
    const videoRef = useRef(null);
    const hideTimer = useRef(null);
    const dragging = useRef(false);

    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [speed, setSpeed] = useState(1);
    const [showSpeed, setShowSpeed] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [showChrome, setShowChrome] = useState(true);
    const [hoverPct, setHoverPct] = useState(null);
    const [ready, setReady] = useState(false);

    const clearHide = () => {
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
    };

    const scheduleHide = useCallback(() => {
        clearHide();
        hideTimer.current = setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) setShowChrome(false);
        }, 2200);
    }, []);

    const reveal = useCallback(() => {
        setShowChrome(true);
        scheduleHide();
    }, [scheduleHide]);

    useEffect(() => () => clearHide(), []);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return undefined;

        const onPlay = () => { setPlaying(true); scheduleHide(); };
        const onPause = () => { setPlaying(false); setShowChrome(true); clearHide(); };
        const onTime = () => { if (!dragging.current) setCurrent(v.currentTime || 0); };
        const onMeta = () => {
            const d = v.duration;
            if (Number.isFinite(d)) {
                setDuration(d);
                onDuration?.(d);
            }
            setReady(true);
        };
        const onProg = () => {
            try {
                if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
            } catch { /* noop */ }
        };
        const onVol = () => {
            setMuted(v.muted || v.volume === 0);
            setVolume(v.volume);
        };
        const onEnded = () => { setPlaying(false); setShowChrome(true); };

        v.addEventListener('play', onPlay);
        v.addEventListener('pause', onPause);
        v.addEventListener('timeupdate', onTime);
        v.addEventListener('loadedmetadata', onMeta);
        v.addEventListener('durationchange', onMeta);
        v.addEventListener('progress', onProg);
        v.addEventListener('volumechange', onVol);
        v.addEventListener('ended', onEnded);

        if (autoPlay) v.play().catch(() => {});

        return () => {
            v.removeEventListener('play', onPlay);
            v.removeEventListener('pause', onPause);
            v.removeEventListener('timeupdate', onTime);
            v.removeEventListener('loadedmetadata', onMeta);
            v.removeEventListener('durationchange', onMeta);
            v.removeEventListener('progress', onProg);
            v.removeEventListener('volumechange', onVol);
            v.removeEventListener('ended', onEnded);
        };
    }, [src, autoPlay, onDuration, scheduleHide]);

    useEffect(() => {
        const onFs = () => setFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFs);
        return () => document.removeEventListener('fullscreenchange', onFs);
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            const wrap = wrapRef.current;
            const v = videoRef.current;
            if (!wrap || !v) return;
            if (!wrap.contains(document.activeElement) && document.activeElement !== document.body && !wrap.matches(':hover')) {
                return;
            }
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

            if (e.key === ' ' || e.key === 'k') {
                e.preventDefault();
                if (v.paused) v.play().catch(() => {});
                else v.pause();
                setShowChrome(true);
            } else if (e.key === 'ArrowLeft' || e.key === 'j') {
                e.preventDefault();
                if (Number.isFinite(v.duration)) {
                    v.currentTime = Math.max(0, (v.currentTime || 0) - 10);
                    setCurrent(v.currentTime);
                }
            } else if (e.key === 'ArrowRight' || e.key === 'l') {
                e.preventDefault();
                if (Number.isFinite(v.duration)) {
                    v.currentTime = Math.min(v.duration, (v.currentTime || 0) + 10);
                    setCurrent(v.currentTime);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const next = Math.min(1, (v.volume || 0) + 0.1);
                v.volume = next;
                v.muted = false;
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = Math.max(0, (v.volume || 0) - 0.1);
                v.volume = next;
                if (next === 0) v.muted = true;
            } else if (e.key === 'm') {
                e.preventDefault();
                v.muted = !v.muted;
            } else if (e.key === 'f') {
                e.preventDefault();
                (async () => {
                    try {
                        if (!document.fullscreenElement) await wrap.requestFullscreen();
                        else await document.exitFullscreen();
                    } catch { /* noop */ }
                })();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
        reveal();
    };

    const seekBy = (delta) => {
        const v = videoRef.current;
        if (!v || !Number.isFinite(v.duration)) return;
        v.currentTime = Math.max(0, Math.min(v.duration, (v.currentTime || 0) + delta));
        setCurrent(v.currentTime);
        reveal();
    };

    const seekToPct = (pct) => {
        const v = videoRef.current;
        if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
        const t = Math.max(0, Math.min(1, pct)) * v.duration;
        v.currentTime = t;
        setCurrent(t);
    };

    const setVol = (val) => {
        const v = videoRef.current;
        if (!v) return;
        const next = Math.max(0, Math.min(1, val));
        v.volume = next;
        v.muted = next === 0;
        setVolume(next);
        setMuted(next === 0);
        reveal();
    };

    const toggleMute = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.muted || v.volume === 0) {
            v.muted = false;
            if (v.volume === 0) v.volume = volume > 0 ? volume : 0.8;
        } else {
            v.muted = true;
        }
        reveal();
    };

    const changeSpeed = (s) => {
        const v = videoRef.current;
        if (!v) return;
        v.playbackRate = s;
        setSpeed(s);
        setShowSpeed(false);
        reveal();
    };

    const toggleFullscreen = async () => {
        const el = wrapRef.current;
        if (!el) return;
        try {
            if (!document.fullscreenElement) await el.requestFullscreen();
            else await document.exitFullscreen();
        } catch { /* noop */ }
        reveal();
    };

    const pctFromEvent = (e, el) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
        return Math.max(0, Math.min(1, x / rect.width));
    };

    const onBarDown = (e) => {
        const bar = e.currentTarget;
        dragging.current = true;
        seekToPct(pctFromEvent(e, bar));
        const onMove = (ev) => seekToPct(pctFromEvent(ev, bar));
        const onUp = () => {
            dragging.current = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onUp);
        reveal();
    };

    const progress = duration > 0 ? (current / duration) * 100 : 0;
    const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
    const chromeVisible = showChrome || !playing || showSpeed;

    return (
        <div
            ref={wrapRef}
            className={`relative group bg-black overflow-hidden select-none ${className}`}
            data-testid={testId}
            onMouseMove={reveal}
            onMouseLeave={() => { if (playing && !showSpeed) setShowChrome(false); }}
            tabIndex={0}
        >
            <video
                ref={videoRef}
                src={src}
                poster={poster}
                playsInline
                preload="metadata"
                className={`w-full bg-black block ${videoClassName}`}
                onClick={togglePlay}
                data-testid={`${testId}-video`}
            />

            {/* Center play / pause flash */}
            {ready && !playing && (
                <button
                    type="button"
                    onClick={togglePlay}
                    className="absolute inset-0 m-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 text-slate-900 shadow-2xl flex items-center justify-center hover:scale-105 transition-transform"
                    aria-label="Play"
                    data-testid={`${testId}-center-play`}
                >
                    <Play className="w-7 h-7 sm:w-8 sm:h-8 ml-1" fill="currentColor" />
                </button>
            )}

            {/* Gradient + controls */}
            <div
                className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 ${
                    chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
            >
                <div className="bg-gradient-to-t from-black/85 via-black/45 to-transparent pt-16 px-3 sm:px-4 pb-3">
                    {/* Scrubber */}
                    <div
                        className="relative h-5 flex items-center cursor-pointer group/bar mb-1"
                        onMouseDown={onBarDown}
                        onTouchStart={onBarDown}
                        onMouseMove={(e) => setHoverPct(pctFromEvent(e, e.currentTarget))}
                        onMouseLeave={() => setHoverPct(null)}
                        data-testid={`${testId}-scrubber`}
                        role="slider"
                        aria-valuemin={0}
                        aria-valuemax={duration || 0}
                        aria-valuenow={current}
                        aria-label="Seek"
                    >
                        <div className="absolute inset-x-0 h-1 rounded-full bg-white/25 overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${bufPct}%` }} />
                            <div className="absolute inset-y-0 left-0 bg-rose-500" style={{ width: `${progress}%` }} />
                        </div>
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md opacity-0 group-hover/bar:opacity-100 transition-opacity"
                            style={{ left: `calc(${progress}% - 7px)` }}
                        />
                        {hoverPct != null && duration > 0 && (
                            <div
                                className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white tabular-nums pointer-events-none"
                                style={{ left: `${hoverPct * 100}%` }}
                            >
                                {fmt(hoverPct * duration)}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 sm:gap-1.5 text-white">
                        <button type="button" onClick={() => seekBy(-10)} className="p-2 rounded-lg hover:bg-white/10" title="Back 10s" data-testid={`${testId}-back`}>
                            <SkipBack className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={togglePlay} className="p-2 rounded-lg hover:bg-white/10" title={playing ? 'Pause' : 'Play'} data-testid={`${testId}-play-toggle`}>
                            {playing ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" />}
                        </button>
                        <button type="button" onClick={() => seekBy(10)} className="p-2 rounded-lg hover:bg-white/10" title="Forward 10s" data-testid={`${testId}-forward`}>
                            <SkipForward className="w-4 h-4" />
                        </button>

                        <span className="text-xs tabular-nums text-white/80 px-1.5 min-w-[5.5rem]" data-testid={`${testId}-time`}>
                            {fmt(current)} / {fmt(duration)}
                        </span>

                        <div className="flex items-center gap-1 ml-1 group/vol">
                            <button type="button" onClick={toggleMute} className="p-2 rounded-lg hover:bg-white/10" title={muted ? 'Unmute' : 'Mute'} data-testid={`${testId}-mute`}>
                                {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.05}
                                value={muted ? 0 : volume}
                                onChange={(e) => setVol(parseFloat(e.target.value))}
                                className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-rose-500 h-1 cursor-pointer opacity-0 group-hover/vol:opacity-100"
                                aria-label="Volume"
                                data-testid={`${testId}-volume`}
                            />
                        </div>

                        <div className="flex-1" />

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowSpeed((v) => !v)}
                                className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-semibold tabular-nums flex items-center gap-1"
                                title="Playback speed"
                                data-testid={`${testId}-speed-btn`}
                            >
                                <Settings2 className="w-3.5 h-3.5 opacity-70" />
                                {speed === 1 ? '1x' : `${speed}x`}
                            </button>
                            {showSpeed && (
                                <div className="absolute bottom-full right-0 mb-2 py-1 rounded-xl bg-slate-900/95 border border-white/10 shadow-xl min-w-[88px]" data-testid={`${testId}-speed-menu`}>
                                    {SPEEDS.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => changeSpeed(s)}
                                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 ${speed === s ? 'text-rose-300 font-semibold' : 'text-white/85'}`}
                                        >
                                            {s === 1 ? 'Normal' : `${s}x`}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button type="button" onClick={toggleFullscreen} className="p-2 rounded-lg hover:bg-white/10" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} data-testid={`${testId}-fullscreen`}>
                            {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoomPlayer;
