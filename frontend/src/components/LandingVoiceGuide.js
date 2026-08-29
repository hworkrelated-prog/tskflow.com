import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { createDictationSession } from '@/lib/promptVoice';

export const GUIDE_OPEN =
    'This is simple. Say or type one sentence: who should do it, what they should do, and when. Then add their email and send.';
export const GUIDE_AFTER_HEAR =
    'Got it. Next, add who should get this, then send. You can skip the email if you just want to try it.';

const pickVoice = () => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const rank = (v) => {
        const n = `${v.name} ${v.lang}`.toLowerCase();
        let score = 0;
        if (/en(-|_)?(us|gb|au)/i.test(v.lang)) score += 10;
        if (/google|microsoft|samantha|aria|jenny|natural|neural/i.test(n)) score += 8;
        if (/compact|espeak|robot/i.test(n)) score -= 10;
        return score;
    };
    return [...voices].sort((a, b) => rank(b) - rank(a))[0] || null;
};

const forSpeech = (text) => (text || '').replace(/\s+/g, ' ').trim();

/**
 * Guest-safe voice guide for the landing page. Speaks the next step and can
 * fill the ask from the microphone. Does not call the signed-in Jarvis API.
 */
export default function LandingVoiceGuide({
    onHeard,
    onAfterGuide,
    inputValue,
}) {
    const [phase, setPhase] = useState('idle'); // idle | speaking | listening
    const [caption, setCaption] = useState('');
    const [supported, setSupported] = useState(true);
    const voiceRef = useRef(null);
    const dictationRef = useRef(null);
    const inputRef = useRef(inputValue || '');
    const onHeardRef = useRef(onHeard);
    const onAfterGuideRef = useRef(onAfterGuide);
    const supportedRef = useRef(true);
    const startListeningRef = useRef(() => {});

    inputRef.current = inputValue || '';
    onHeardRef.current = onHeard;
    onAfterGuideRef.current = onAfterGuide;

    useEffect(() => {
        if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) setSupported(false);
    }, []);

    useEffect(() => {
        supportedRef.current = supported;
    }, [supported]);

    useEffect(() => {
        if (!('speechSynthesis' in window)) return undefined;
        const load = () => {
            voiceRef.current = pickVoice();
        };
        load();
        window.speechSynthesis.addEventListener('voiceschanged', load);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
    }, []);

    const speak = useCallback((text, { thenListen = false } = {}) => {
        const cleaned = forSpeech(text);
        setCaption(cleaned);
        if (!('speechSynthesis' in window) || !cleaned) {
            if (thenListen) startListeningRef.current();
            return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(cleaned);
        const voice = voiceRef.current || pickVoice();
        if (voice) u.voice = voice;
        u.rate = 1.02;
        u.onstart = () => setPhase('speaking');
        u.onend = () => {
            if (thenListen) startListeningRef.current();
            else setPhase('idle');
        };
        u.onerror = () => setPhase('idle');
        window.speechSynthesis.speak(u);
    }, []);

    const getDictation = useCallback(() => {
        if (!dictationRef.current) {
            dictationRef.current = createDictationSession({
                getDisplayed: () => inputRef.current,
                getSeed: () => inputRef.current,
                onTranscript: ({ shown, spoken }) => {
                    onHeardRef.current?.(shown || spoken || '');
                },
            });
        }
        return dictationRef.current;
    }, []);

    const stopListening = useCallback(() => {
        getDictation().stop({ commit: false });
        setPhase((p) => (p === 'listening' ? 'idle' : p));
    }, [getDictation]);

    const startListening = useCallback(() => {
        if (!supportedRef.current) {
            toast.info('This browser cannot listen. Type the ask instead.');
            return;
        }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        const result = getDictation().start({
            onCommit: (t) => {
                setPhase('idle');
                if (t) {
                    onHeardRef.current?.(t);
                    speak(GUIDE_AFTER_HEAR);
                    onAfterGuideRef.current?.('who');
                }
            },
            onError: (error) => {
                setPhase('idle');
                if (error === 'not-allowed') toast.error('Microphone permission denied');
            },
        });
        if (!result.started) {
            if (result.reason === 'unsupported') setSupported(false);
            return;
        }
        setPhase('listening');
        setCaption('Listening… say the ask in one sentence.');
    }, [getDictation, speak]);

    startListeningRef.current = startListening;

    useEffect(() => () => {
        dictationRef.current?.stop({ commit: false });
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }, []);

    const startGuide = () => {
        stopListening();
        speak(GUIDE_OPEN, { thenListen: supported });
        onAfterGuideRef.current?.('ask');
    };

    const stopGuide = () => {
        stopListening();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setPhase('idle');
        setCaption('');
    };

    const toggleMic = () => {
        if (phase === 'listening') stopListening();
        else startListening();
    };

    const active = phase === 'speaking' || phase === 'listening';

    return (
        <div className="flex items-center gap-1.5" data-testid="landing-voice">
            <button
                type="button"
                onClick={active ? stopGuide : startGuide}
                className={`h-10 px-3 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${
                    phase === 'speaking'
                        ? 'bg-teal-400 text-slate-950'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                data-testid="landing-voice-guide"
                aria-pressed={active}
                aria-label={active ? 'Stop voice guide' : 'Start voice guide'}
            >
                {active ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {active ? 'Stop' : 'Voice'}
            </button>
            <button
                type="button"
                onClick={toggleMic}
                className={`h-10 w-10 rounded-full inline-flex items-center justify-center ${
                    phase === 'listening'
                        ? 'bg-red-500 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                data-testid="landing-voice-mic"
                aria-label={phase === 'listening' ? 'Stop listening' : 'Speak your ask'}
                title={phase === 'listening' ? 'Stop listening' : 'Speak your ask'}
            >
                {phase === 'listening' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            {caption ? (
                <span className="sr-only" data-testid="landing-voice-caption">{caption}</span>
            ) : null}
        </div>
    );
}
