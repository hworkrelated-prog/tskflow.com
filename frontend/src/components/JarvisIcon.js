import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Modern Jarvis mark — soft squircle + geometric J, not a plain letter badge.
 */
export const JarvisIcon = ({
    size = 40,
    phase = 'idle',
    className = '',
    showRing = false,
}) => {
    const listening = phase === 'listening';
    const thinking = phase === 'thinking';
    const speaking = phase === 'speaking';

    const bg = listening
        ? 'url(#jarvisGradListen)'
        : 'url(#jarvisGradIdle)';

    const uid = React.useId().replace(/:/g, '');

    return (
        <span
            className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
            style={{ width: size, height: size }}
            aria-hidden
        >
            <svg
                width={size}
                height={size}
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="block"
            >
                <defs>
                    <linearGradient id={`jarvisGradIdle-${uid}`} x1="8" y1="4" x2="34" y2="38" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#14B8A6" />
                        <stop offset="0.55" stopColor="#0F766E" />
                        <stop offset="1" stopColor="#0F172A" />
                    </linearGradient>
                    <linearGradient id={`jarvisGradListen-${uid}`} x1="8" y1="4" x2="34" y2="38" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#FB7185" />
                        <stop offset="1" stopColor="#B91C1C" />
                    </linearGradient>
                    <linearGradient id={`jarvisSheen-${uid}`} x1="12" y1="6" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#fff" stopOpacity="0.45" />
                        <stop offset="1" stopColor="#fff" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {/* Squircle body */}
                <rect
                    x="1.5"
                    y="1.5"
                    width="37"
                    height="37"
                    rx="12"
                    fill={listening ? `url(#jarvisGradListen-${uid})` : `url(#jarvisGradIdle-${uid})`}
                />
                <rect
                    x="1.5"
                    y="1.5"
                    width="37"
                    height="37"
                    rx="12"
                    fill={`url(#jarvisSheen-${uid})`}
                />
                {/* Geometric J */}
                {!thinking && (
                    <path
                        d="M22.2 10.2c0-.7.55-1.25 1.25-1.25h1.1c.7 0 1.25.55 1.25 1.25v12.4c0 4.15-2.85 6.7-6.95 6.7-4.05 0-6.85-2.45-6.85-6.35 0-.7.55-1.25 1.25-1.25h1.05c.7 0 1.25.55 1.25 1.25 0 2.05 1.35 3.35 3.3 3.35 2.05 0 3.35-1.35 3.35-3.7V10.2Z"
                        fill="white"
                        fillOpacity="0.96"
                    />
                )}
                {/* Accent spark */}
                {!thinking && !listening && (
                    <circle cx="29.5" cy="11" r="2.1" fill="#5EEAD4" fillOpacity="0.95" />
                )}
            </svg>
            {thinking && (
                <Loader2
                    className="absolute text-white animate-spin"
                    style={{ width: size * 0.42, height: size * 0.42 }}
                />
            )}
            {(showRing || speaking || listening) && (
                <span
                    className={`pointer-events-none absolute inset-0 rounded-[30%] ${
                        listening || speaking ? 'ring-2 ring-white/50 animate-pulse' : ''
                    }`}
                />
            )}
        </span>
    );
};

export default JarvisIcon;
