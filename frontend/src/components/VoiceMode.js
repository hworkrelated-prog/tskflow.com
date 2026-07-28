import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, X, Volume2, Loader2, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, API } from '@/App';

// Redesigned Voice Mode:
//  * Tapping the mic starts listening IMMEDIATELY (no popup).
//  * A tiny minimized indicator hovers bottom-right showing state (Listening / Thinking / Speaking).
//  * Persists across navigation because it's mounted at the app root.
//  * Also acts as the in-app assistant (voice OR text) for "how do I…" questions.

const getRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    return rec;
};

const routeFor = (target) => ({
    dashboard: '/dashboard',
    analytics: '/analytics',
    team: '/team',
    settings: '/settings',
    leads: '/leads',
    help: '/help',
    recordings: '/recordings',
    recurring: '/recurring',
}[target]);

const VoiceMode = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [phase, setPhase] = useState('idle'); // idle | listening | thinking | speaking
    const [transcript, setTranscript] = useState('');
    const [reply, setReply] = useState('');
    const [supported, setSupported] = useState(true);
    const [expanded, setExpanded] = useState(false); // small draggable minimized bubble unless "expanded"
    const recRef = useRef(null);
    const [textInput, setTextInput] = useState('');

    useEffect(() => {
        if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) setSupported(false);
    }, []);

    const speak = useCallback((text) => {
        if (!('speechSynthesis' in window) || !text) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.02;
        u.pitch = 1.0;
        u.onstart = () => setPhase('speaking');
        u.onend = () => setPhase('idle');
        window.speechSynthesis.speak(u);
    }, []);

    const sendCommand = useCallback(async (text) => {
        if (!text || !text.trim()) return;
        setPhase('thinking');
        setReply('');
        try {
            const res = await axios.post(`${API}/voice/command`, { transcript: text });
            const { reply: r, action, executed } = res.data;
            setReply(r);
            speak(r);
            if (action?.type === 'navigate') {
                const route = routeFor(action.params?.target);
                if (route) setTimeout(() => navigate(route), 700);
            }
            if (['create_task', 'assign_task', 'update_status'].includes(action?.type) && executed) {
                window.dispatchEvent(new CustomEvent('tskflow:voice-executed', { detail: executed }));
            }
        } catch (err) {
            const msg = 'Sorry, I had trouble with that. Please try again.';
            setReply(msg);
            speak(msg);
            setPhase('idle');
        }
    }, [navigate, speak]);

    const startListening = useCallback(() => {
        if (!supported) {
            toast.error('Voice input not supported in this browser (try Chrome).');
            return;
        }
        // Cancel any speaking
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        const rec = getRecognition();
        if (!rec) { setSupported(false); return; }
        recRef.current = rec;
        setTranscript('');
        setReply('');
        setPhase('listening');
        setExpanded(true);
        let finalText = '';
        rec.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
                else interim += e.results[i][0].transcript;
            }
            setTranscript(finalText || interim);
        };
        rec.onend = () => {
            if (finalText && finalText.trim()) sendCommand(finalText);
            else setPhase((p) => (p === 'listening' ? 'idle' : p));
        };
        rec.onerror = (ev) => {
            setPhase('idle');
            if (ev.error === 'not-allowed') toast.error('Microphone permission denied');
            else if (ev.error === 'no-speech') toast('Didn\'t catch that \u2014 tap the mic and try again.');
        };
        try { rec.start(); } catch (e) { /* already started */ }
    }, [sendCommand, supported]);

    const stopListening = useCallback(() => {
        if (recRef.current) { try { recRef.current.stop(); } catch (e) { /* noop */ } }
        setPhase('idle');
    }, []);

    const cancelAll = useCallback(() => {
        stopListening();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setPhase('idle');
        setExpanded(false);
    }, [stopListening]);

    // Global hotkey: cmd+shift+m / ctrl+shift+m to toggle listening
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
                e.preventDefault();
                if (phase === 'listening') stopListening(); else startListening();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [phase, startListening, stopListening]);

    if (!user) return null;
    const hiddenPaths = ['/login', '/register', '/verify-email', '/forgot-password'];
    if (hiddenPaths.includes(location.pathname)) return null;

    const label = { idle: 'Ask me anything', listening: 'Listening\u2026', thinking: 'Thinking\u2026', speaking: 'Speaking\u2026' }[phase];
    const busy = phase !== 'idle';

    return (
        <>
            {/* Persistent tiny bottom-right mic. Persists across pages. */}
            <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2" data-testid="voice-mode-widget">
                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="w-80 max-w-[95vw] bg-white rounded-2xl shadow-2xl border p-4"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2.5 h-2.5 rounded-full ${busy ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
                                    <span className="text-xs font-medium text-gray-600">{label}</span>
                                </div>
                                <button onClick={cancelAll} className="text-gray-400 hover:text-gray-700" aria-label="Close voice mode">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            {transcript && (
                                <div className="text-sm bg-slate-50 rounded-lg p-2 mb-2 border">
                                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">You</div>
                                    {transcript}
                                </div>
                            )}
                            {reply && (
                                <div className="text-sm bg-indigo-50 rounded-lg p-2 border border-indigo-100">
                                    <div className="text-[10px] uppercase tracking-wide text-indigo-500 mb-0.5">Assistant</div>
                                    {reply}
                                </div>
                            )}
                            {!transcript && !reply && (
                                <div className="text-xs text-gray-500 leading-relaxed">
                                    Try &ldquo;What&rsquo;s outstanding?&rdquo;, &ldquo;Create a task to email Sarah tomorrow&rdquo;, or &ldquo;How do drafts work?&rdquo;
                                </div>
                            )}
                            <div className="mt-3 flex gap-2">
                                <input
                                    type="text"
                                    className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Or type your question\u2026"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && textInput.trim()) {
                                            const t = textInput.trim();
                                            setTextInput('');
                                            setTranscript(t);
                                            sendCommand(t);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => { if (textInput.trim()) { const t = textInput.trim(); setTextInput(''); setTranscript(t); sendCommand(t); } }}
                                    className="text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700"
                                >Send</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.button
                    data-testid="voice-mode-mic"
                    onClick={phase === 'listening' ? stopListening : startListening}
                    animate={phase === 'listening' ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                    transition={phase === 'listening' ? { repeat: Infinity, duration: 1.2 } : {}}
                    className={`h-14 w-14 rounded-full flex items-center justify-center text-white shadow-lg transition-colors ${phase === 'listening' ? 'bg-red-500' : phase === 'thinking' ? 'bg-slate-400' : phase === 'speaking' ? 'bg-emerald-500' : 'bg-gradient-to-br from-indigo-600 to-purple-600'}`}
                    title={label}
                    aria-label={label}
                >
                    {phase === 'thinking' ? <Loader2 className="w-6 h-6 animate-spin" /> : phase === 'speaking' ? <Volume2 className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </motion.button>
                {/* Tiny help pill */}
                {!expanded && (
                    <button
                        onClick={() => setExpanded(true)}
                        className="text-[10px] text-gray-500 bg-white/80 backdrop-blur px-2 py-0.5 rounded-full border shadow-sm hover:bg-white"
                        title="Voice Mode also answers 'how do I...' questions"
                    >
                        <HelpCircle className="w-3 h-3 inline mr-0.5" /> Ask
                    </button>
                )}
            </div>
        </>
    );
};

export default VoiceMode;
