import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Loader2, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, API } from '@/App';

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
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState('idle'); // idle | listening | thinking | speaking
    const [messages, setMessages] = useState([]); // {id, role: 'user'|'assistant', text}
    const [textInput, setTextInput] = useState('');
    const [supported, setSupported] = useState(true);
    const [nudge, setNudge] = useState(false);
    const [wiggle, setWiggle] = useState(false);
    const recRef = useRef(null);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const nudgeTimer = useRef(null);
    const messagesRef = useRef([]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) setSupported(false);
    }, []);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages, phase]);

    const speak = useCallback((text) => {
        if (!('speechSynthesis' in window) || !text) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.02;
        u.onstart = () => setPhase('speaking');
        u.onend = () => setPhase('idle');
        window.speechSynthesis.speak(u);
    }, []);

    const sendCommand = useCallback(async (text, { speakReply = true } = {}) => {
        const trimmed = (text || '').trim();
        if (!trimmed) return;
        const userMsg = { id: `${Date.now()}-u`, role: 'user', text: trimmed };
        const historyPayload = [...messagesRef.current, userMsg]
            .slice(-12)
            .map((m) => ({ role: m.role, text: m.text }));
        setMessages((prev) => [...prev, userMsg]);
        setPhase('thinking');
        try {
            const res = await axios.post(`${API}/voice/command`, {
                transcript: trimmed,
                history: historyPayload,
            });
            const { reply: r, action, executed } = res.data;
            const replyText = r || 'Okay.';
            setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: 'assistant', text: replyText }]);
            if (speakReply) speak(replyText);
            else setPhase('idle');
            if (action?.type === 'navigate') {
                const route = routeFor(action.params?.target);
                if (route) setTimeout(() => navigate(route), 500);
            }
            if (['create_task', 'assign_task', 'update_status'].includes(action?.type) && executed) {
                window.dispatchEvent(new CustomEvent('tskflow:voice-executed', { detail: executed }));
            }
        } catch (err) {
            const msg = err?.response?.data?.detail || 'Sorry, I had trouble with that. Try again?';
            setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: 'assistant', text: msg }]);
            setPhase('idle');
        }
    }, [navigate, speak]);

    const startListening = useCallback(() => {
        if (!supported) {
            toast.error('Voice not supported here — type instead.');
            inputRef.current?.focus();
            return;
        }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        const rec = getRecognition();
        if (!rec) {
            setSupported(false);
            return;
        }
        recRef.current = rec;
        setPhase('listening');
        setOpen(true);
        let finalText = '';
        rec.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
                else interim += e.results[i][0].transcript;
            }
            setTextInput(finalText || interim);
        };
        rec.onend = () => {
            if (finalText && finalText.trim()) {
                const t = finalText.trim();
                setTextInput('');
                sendCommand(t);
            } else {
                setPhase((p) => (p === 'listening' ? 'idle' : p));
            }
        };
        rec.onerror = (ev) => {
            setPhase('idle');
            if (ev.error === 'not-allowed') toast.error('Microphone permission denied');
        };
        try { rec.start(); } catch (_) { /* already started */ }
    }, [sendCommand, supported]);

    const stopListening = useCallback(() => {
        if (recRef.current) {
            try { recRef.current.stop(); } catch (_) { /* noop */ }
        }
        setPhase((p) => (p === 'listening' ? 'idle' : p));
    }, []);

    const openPanel = useCallback(() => {
        setOpen(true);
        setNudge(false);
        setWiggle(false);
        setTimeout(() => inputRef.current?.focus(), 80);
    }, []);

    const closePanel = useCallback(() => {
        stopListening();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setPhase('idle');
        setOpen(false);
        // Keep messages for this session while the widget lives; clear only on full unmount
    }, [stopListening]);

    // Soft nudge from elsewhere (e.g. stuck on assignee pick)
    useEffect(() => {
        const onNudge = (e) => {
            if (open) return;
            const reason = e?.detail?.reason || 'Need a hand?';
            setNudge(reason);
            setWiggle(true);
            if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
            nudgeTimer.current = setTimeout(() => {
                setWiggle(false);
                setNudge(false);
            }, 6000);
        };
        window.addEventListener('tskflow:nudge-assistant', onNudge);
        return () => {
            window.removeEventListener('tskflow:nudge-assistant', onNudge);
            if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
        };
    }, [open]);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')) {
                e.preventDefault();
                if (open && phase === 'listening') stopListening();
                else if (open) startListening();
                else openPanel();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, phase, openPanel, startListening, stopListening]);

    if (!user) return null;
    const hiddenPaths = ['/login', '/register', '/verify-email', '/forgot-password'];
    if (hiddenPaths.includes(location.pathname)) return null;

    const busy = phase === 'thinking' || phase === 'listening' || phase === 'speaking';

    const submitText = () => {
        const t = textInput.trim();
        if (!t || phase === 'thinking') return;
        setTextInput('');
        sendCommand(t, { speakReply: false });
    };

    return (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2" data-testid="voice-mode-widget">
            <AnimatePresence>
                {nudge && !open && (
                    <motion.button
                        type="button"
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6 }}
                        onClick={openPanel}
                        className="max-w-[220px] text-left text-xs bg-white border border-slate-200 shadow-lg rounded-2xl px-3 py-2 text-slate-700 hover:bg-slate-50"
                        data-testid="voice-nudge-bubble"
                    >
                        {typeof nudge === 'string' ? nudge : 'Need a hand?'} Tap to ask.
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.96 }}
                        className="w-[340px] max-w-[94vw] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
                        data-testid="voice-chat-panel"
                    >
                        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
                            <div className="flex items-center gap-2 min-w-0">
                                <Sparkles className="w-4 h-4 text-slate-800 shrink-0" />
                                <span className="text-sm font-semibold text-slate-800 truncate">Assistant</span>
                                {busy && (
                                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                        {phase === 'listening' ? 'Listening' : phase === 'thinking' ? 'Thinking' : 'Speaking'}
                                    </span>
                                )}
                            </div>
                            <button type="button" onClick={closePanel} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Close">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div ref={listRef} className="h-64 overflow-y-auto px-3.5 py-3 space-y-2.5 bg-slate-50/60">
                            {messages.length === 0 && (
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Ask anything — tasks, how-tos, or what&apos;s outstanding.
                                </p>
                            )}
                            {messages.map((m) => (
                                <div
                                    key={m.id}
                                    className={`text-sm px-3 py-2 rounded-2xl max-w-[90%] whitespace-pre-wrap ${
                                        m.role === 'user'
                                            ? 'ml-auto bg-slate-900 text-white rounded-br-md'
                                            : 'mr-auto bg-white border border-slate-200 text-slate-800 rounded-bl-md'
                                    }`}
                                >
                                    {m.text}
                                </div>
                            ))}
                            {phase === 'thinking' && (
                                <div className="mr-auto inline-flex items-center gap-1.5 text-xs text-slate-500 bg-white border border-slate-200 rounded-full px-2.5 py-1">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                                </div>
                            )}
                        </div>

                        <div className="p-2.5 border-t border-slate-100 flex items-center gap-1.5 bg-white">
                            <button
                                type="button"
                                onClick={phase === 'listening' ? stopListening : startListening}
                                className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                    phase === 'listening' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                                aria-label={phase === 'listening' ? 'Stop listening' : 'Talk'}
                                title={phase === 'listening' ? 'Stop' : 'Talk'}
                                data-testid="voice-mode-mic"
                            >
                                {phase === 'listening' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                            </button>
                            <input
                                ref={inputRef}
                                type="text"
                                className="flex-1 min-w-0 border border-slate-200 rounded-full px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                placeholder="Type a message…"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        submitText();
                                    }
                                }}
                                disabled={phase === 'thinking'}
                                data-testid="voice-text-input"
                            />
                            <button
                                type="button"
                                onClick={submitText}
                                disabled={!textInput.trim() || phase === 'thinking'}
                                className="h-9 w-9 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-40 hover:bg-slate-800"
                                aria-label="Send"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                type="button"
                data-testid="voice-mode-fab"
                onClick={() => (open ? closePanel() : openPanel())}
                animate={wiggle ? { rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.08, 1] } : { rotate: 0, scale: 1 }}
                transition={wiggle ? { duration: 0.7 } : { duration: 0.15 }}
                className={`h-14 w-14 rounded-full flex items-center justify-center text-white shadow-xl transition-colors ${
                    open ? 'bg-slate-700' : phase === 'listening' ? 'bg-red-500' : 'bg-slate-900'
                }`}
                title="Assistant"
                aria-label="Open assistant"
            >
                {phase === 'thinking' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
            </motion.button>
        </div>
    );
};

export default VoiceMode;
