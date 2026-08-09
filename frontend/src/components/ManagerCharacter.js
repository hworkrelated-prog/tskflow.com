import React from 'react';
import { motion } from 'framer-motion';

/**
 * Jarvis — professional AI manager avatar.
 * Moods: idle | listening | thinking | speaking | guiding
 * Pure SVG + motion (no external assets).
 */
const ManagerCharacter = ({
    mood = 'idle',
    size = 88,
    showName = false,
    className = '',
    caption = '',
}) => {
    const speaking = mood === 'speaking';
    const listening = mood === 'listening';
    const thinking = mood === 'thinking';
    const guiding = mood === 'guiding';

    return (
        <div className={`flex flex-col items-center ${className}`} data-testid="manager-character" data-mood={mood}>
            <motion.div
                animate={
                    listening ? { scale: [1, 1.04, 1] }
                        : speaking ? { y: [0, -2, 0] }
                            : guiding ? { y: [0, -4, 0] }
                                : { y: [0, -3, 0] }
                }
                transition={{
                    duration: listening ? 1.1 : speaking ? 0.45 : 2.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                }}
                style={{ width: size, height: size }}
                className="relative"
            >
                {/* Soft aura */}
                <motion.div
                    className="absolute inset-[-10%] rounded-full"
                    style={{
                        background: listening
                            ? 'radial-gradient(circle, rgba(13,148,136,0.35) 0%, transparent 70%)'
                            : speaking
                                ? 'radial-gradient(circle, rgba(15,118,110,0.4) 0%, transparent 70%)'
                                : 'radial-gradient(circle, rgba(15,23,42,0.12) 0%, transparent 70%)',
                    }}
                    animate={listening || speaking ? { opacity: [0.55, 1, 0.55] } : { opacity: 0.7 }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                />

                <svg viewBox="0 0 120 120" width={size} height={size} className="relative z-10 drop-shadow-md">
                    <defs>
                        <linearGradient id="jarvis-skin" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#f3e7d9" />
                            <stop offset="100%" stopColor="#e4cbb0" />
                        </linearGradient>
                        <linearGradient id="jarvis-suit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1e293b" />
                            <stop offset="100%" stopColor="#0f172a" />
                        </linearGradient>
                        <linearGradient id="jarvis-ring" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#0f766e" />
                            <stop offset="100%" stopColor="#134e4a" />
                        </linearGradient>
                    </defs>

                    {/* Outer ring */}
                    <circle cx="60" cy="60" r="56" fill="url(#jarvis-ring)" opacity="0.95" />
                    <circle cx="60" cy="60" r="50" fill="#f8faf9" />

                    {/* Shoulders / suit */}
                    <ellipse cx="60" cy="108" rx="38" ry="22" fill="url(#jarvis-suit)" />
                    <path d="M42 96 L60 108 L78 96 L78 120 L42 120 Z" fill="url(#jarvis-suit)" />
                    {/* Tie accent */}
                    <path d="M57 100 L60 112 L63 100 Z" fill="#0d9488" />

                    {/* Head */}
                    <circle cx="60" cy="52" r="26" fill="url(#jarvis-skin)" />
                    {/* Hair — neat professional */}
                    <path
                        d="M36 48 C38 28, 82 28, 84 48 C78 36, 42 36, 36 48 Z"
                        fill="#1e293b"
                    />
                    <path d="M34 52 C36 40, 48 36, 52 38 L48 52 Z" fill="#1e293b" />
                    <path d="M86 52 C84 40, 72 36, 68 38 L72 52 Z" fill="#1e293b" />

                    {/* Eyes */}
                    <ellipse cx="50" cy="54" rx="3.2" ry={thinking ? 1.2 : 3.4} fill="#0f172a">
                        {!thinking && (
                            <animate attributeName="ry" values="3.4;3.4;0.4;3.4" keyTimes="0;0.92;0.96;1" dur="4s" repeatCount="indefinite" />
                        )}
                    </ellipse>
                    <ellipse cx="70" cy="54" rx="3.2" ry={thinking ? 1.2 : 3.4} fill="#0f172a">
                        {!thinking && (
                            <animate attributeName="ry" values="3.4;3.4;0.4;3.4" keyTimes="0;0.92;0.96;1" dur="4s" repeatCount="indefinite" />
                        )}
                    </ellipse>
                    {/* Eye highlights */}
                    <circle cx="51.2" cy="52.8" r="1" fill="#fff" opacity="0.7" />
                    <circle cx="71.2" cy="52.8" r="1" fill="#fff" opacity="0.7" />

                    {/* Brows */}
                    <path d="M44 47 Q50 44 56 47" stroke="#1e293b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                    <path d="M64 47 Q70 44 76 47" stroke="#1e293b" strokeWidth="1.6" fill="none" strokeLinecap="round" />

                    {/* Nose */}
                    <path d="M60 56 L58 62 L62 62" stroke="#c4a484" strokeWidth="1.2" fill="none" strokeLinecap="round" />

                    {/* Mouth */}
                    {speaking ? (
                        <ellipse cx="60" cy="70" rx="5" ry="3.5" fill="#9a6b5a">
                            <animate attributeName="ry" values="2;4;2.5;3.8;2" dur="0.35s" repeatCount="indefinite" />
                        </ellipse>
                    ) : listening ? (
                        <path d="M54 69 Q60 73 66 69" stroke="#9a6b5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    ) : (
                        <path d="M54 69 Q60 72 66 69" stroke="#9a6b5a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    )}

                    {/* Earpiece / manager cue */}
                    <rect x="84" y="50" width="4" height="10" rx="2" fill="#0d9488" />
                    <circle cx="86" cy="48" r="2.5" fill="#14b8a6" />
                </svg>

                {thinking && (
                    <div className="absolute -top-1 -right-1 flex gap-0.5">
                        {[0, 1, 2].map((i) => (
                            <motion.span
                                key={i}
                                className="w-1.5 h-1.5 rounded-full bg-teal-600"
                                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                            />
                        ))}
                    </div>
                )}
            </motion.div>

            {(showName || caption) && (
                <div className="mt-2 text-center">
                    {showName && (
                        <p className="text-xs font-semibold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Jarvis</p>
                    )}
                    {caption && (
                        <p className="text-[11px] text-slate-500 mt-0.5 max-w-[140px] leading-snug">{caption}</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default ManagerCharacter;
