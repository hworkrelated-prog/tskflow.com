import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { createDictationSession } from '@/lib/promptVoice';
import { speakChatGptVoice, stopChatGptVoice } from '@/lib/chatGptVoice';

export const GUIDE_OPEN =
    'Type the ask. Add who it is for. Then send.';
export const GUIDE_AFTER_HEAR =
    'Who should own this? Add their email, then send.';

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

    const speak = useCallback((text, { thenListen = false } = {}) => {
        const cleaned = forSpeech(text);
        setCaption(cleaned);
        if (!cleaned) {
            if (thenListen) startListeningRef.current();
            return;
        }
        setPhase('speaking');
        speakChatGptVoice(cleaned, {
            onEnd: () => {
                if (thenListen) startListeningRef.current();
                else setPhase('idle');
            },
            onError: () => setPhase('idle'),
        });
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
        stopChatGptVoice();
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
        setCaption('Listening…');
    }, [getDictation, speak]);

    startListeningRef.current = startListening;

    useEffect(() => () => {
        dictationRef.current?.stop({ commit: false });
        stopChatGptVoice();
    }, []);

    const startGuide = () => {
        stopListening();
        speak(GUIDE_OPEN, { thenListen: supported });
        onAfterGuideRef.current?.('ask');
    };

    const stopGuide = () => {
        stopListening();
        stopChatGptVoice();
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
