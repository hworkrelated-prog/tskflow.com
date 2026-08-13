import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Jarvis mark — circular glass orb with a geometric J.
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
                className="block drop-shadow-sm"
            >
                <defs>
                    <linearGradient id={`jg-${uid}`} x1="8" y1="0" x2="32" y2="40" gradientUnits="userSpaceOnUse">
                        <stop stopColor={listening ? '#FB7185' : speaking ? '#5EEAD4' : '#2DD4BF'} />
                        <stop offset="0.42" stopColor={listening ? '#E11D48' : '#0F766E'} />
                        <stop offset="1" stopColor={listening ? '#7F1D1D' : '#042F2E'} />
                    </linearGradient>
                    <radialGradient id={`glow-${uid}`} cx="30%" cy="24%" r="72%">
                        <stop stopColor="#fff" stopOpacity="0.55" />
                        <stop offset="0.45" stopColor="#fff" stopOpacity="0.08" />
                        <stop offset="1" stopColor="#fff" stopOpacity="0" />
                    </radialGradient>
                    <filter id={`blur-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="0.4" />
                    </filter>
                </defs>
                <circle cx="20" cy="20" r="19" fill={`url(#jg-${uid})`} />
                <circle cx="20" cy="20" r="19" fill={`url(#glow-${uid})`} />
                <circle cx="20" cy="20" r="19" stroke="white" strokeOpacity="0.38" strokeWidth="1.25" />
                <circle cx="20" cy="20" r="15.4" stroke="white" strokeOpacity="0.14" strokeWidth="0.9" />
                <ellipse cx="14.5" cy="12" rx="8" ry="4.2" fill="white" fillOpacity="0.18" filter={`url(#blur-${uid})`} />
                {!thinking && (
                    <path
                        d="M22.15 11.2c0-.55.45-1 1-1h.55c.55 0 1 .45 1 1v11.4c0 3.55-2.35 5.7-5.85 5.7-3.35 0-5.6-2.05-5.6-5.25 0-.55.45-1 1-1h.55c.55 0 1 .45 1 1 0 1.7 1.05 2.7 2.95 2.7 1.85 0 2.4-1.15 2.4-2.85V11.2Z"
                        fill="white"
                    />
                )}
            </svg>
            {thinking && (
                <Loader2
                    className="absolute text-white animate-spin"
                    style={{ width: size * 0.38, height: size * 0.38 }}
                />
            )}
            {(showRing || speaking || listening) && (
                <span
                    className={`pointer-events-none absolute -inset-0.5 rounded-full ${
                        listening || speaking ? 'ring-2 ring-white/50 animate-pulse' : ''
                    }`}
                />
            )}
        </span>
    );
};

export default JarvisIcon;
