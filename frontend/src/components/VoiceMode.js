import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, API } from '@/App';
import ManagerCharacter from '@/components/ManagerCharacter';

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

const wantsStageOn = (text) =>
    /\b(show yourself|come (out|here|on screen)|appear|guide me|walk me through|show up|come guide|be on (my )?screen|step in)\b/i.test(text || '');

const wantsStageOff = (text) =>
    /\b(hide yourself|go away|dismiss|step back|leave the screen|stop guiding)\b/i.test(text || '');

const VoiceMode = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState('idle'); // idle | listening | thinking | speaking
    const [messages, setMessages] = useState([]);
    const [textInput, setTextInput] = useState('');
    const [supported, setSupported] = useState(true);
    const [nudge, setNudge] = useState(false);
    const [wiggle, setWiggle] = useState(false);
    const [stagePresence, setStagePresence] = useState(false);
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

    const applyPresenceFromText = useCallback((trimmed) => {
        if (wantsStageOn(trimmed)) setStagePresence(true);
        if (wantsStageOff(trimmed)) setStagePresence(false);
    }, []);

    const sendCommand = useCallback(async (text, { speakReply = true } = {}) => {
        const trimmed = (text || '').trim();
        if (!trimmed) return;
        applyPresenceFromText(trimmed);
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

            const atype = action?.type;
            if (atype === 'show_manager') setStagePresence(true);
            if (atype === 'hide_manager') setStagePresence(false);
            // Guiding intents also bring Jarvis on stage
            if (atype === 'assistant_answer' && wantsStageOn(trimmed)) setStagePresence(true);

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
            const raw = err?.response?.data?.detail ?? err?.response?.data ?? err?.message;
            const asText = typeof raw === 'string' ? raw : (Array.isArray(raw) ? raw.map((x) => x?.msg || JSON.stringify(x)).join('; ') : '');
            const looksLikeProxy = /cloudflare|origin web server|bad gateway|gateway time|html|<!doctype/i.test(asText || '');
            const msg = looksLikeProxy || !asText
                ? 'I hit a connection issue reaching the server. Give it a moment and try again.'
                : asText.slice(0, 280);
            setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: 'assistant', text: msg }]);
            setPhase('idle');
        }
    }, [navigate, speak, applyPresenceFromText]);

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
    }, [stopListening]);

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
        const onOpen = (e) => {
            openPanel();
            if (e?.detail?.stage) setStagePresence(true);
        };
        window.addEventListener('tskflow:nudge-assistant', onNudge);
        window.addEventListener('tskflow:open-assistant', onOpen);
        return () => {
            window.removeEventListener('tskflow:nudge-assistant', onNudge);
            window.removeEventListener('tskflow:open-assistant', onOpen);
            if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
        };
    }, [open, openPanel]);

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
    const characterMood =
        phase === 'listening' ? 'listening'
            : phase === 'thinking' ? 'thinking'
                : phase === 'speaking' ? 'speaking'
                    : stagePresence ? 'guiding' : 'idle';

    const submitText = () => {
        const t = textInput.trim();
        if (!t || phase === 'thinking') return;
        setTextInput('');
        sendCommand(t, { speakReply: false });
    };

    return (
        <>
            {/* On-screen stage presence — Jarvis steps into the workspace */}
            <AnimatePresence>
                {stagePresence && (
                    <motion.div
                        initial={{ opacity: 0, y: 40, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                        className="fixed bottom-28 right-6 z-[39] flex flex-col items-center pointer-events-none"
                        data-testid="jarvis-stage"
                    >
                        <div className="pointer-events-auto rounded-3xl bg-white/90 backdrop-blur border border-teal-200/80 shadow-xl px-5 py-4 flex flex-col items-center max-w-[200px]">
                            <ManagerCharacter
                                mood={characterMood}
                                size={112}
                                showName
                                caption={
                                    phase === 'listening' ? 'I\'m listening…'
                                        : phase === 'thinking' ? 'One moment…'
                                            : phase === 'speaking' ? 'Here to help'
                                                : 'Ask me anything'
                                }
                            />
                            <button
                                type="button"
                                onClick={() => setStagePresence(false)}
                                className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 pointer-events-auto"
                            >
                                Dismiss
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2" data-testid="voice-mode-widget">
                <AnimatePresence>
                    {nudge && !open && (
                        <motion.button
                            type="button"
                            initial={{ opacity: 0, y: 6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6 }}
                            onClick={openPanel}
                            className="max-w-[240px] text-left text-xs bg-white border border-teal-200 shadow-lg rounded-2xl px-3 py-2 text-slate-700 hover:bg-teal-50/50 flex items-start gap-2"
                            data-testid="voice-nudge-bubble"
                        >
                            <ManagerCharacter mood="idle" size={36} className="shrink-0" />
                            <span className="pt-1">
                                {typeof nudge === 'string' ? nudge : 'Need a hand?'} Tap to ask Jarvis.
                            </span>
                        </motion.button>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {open && (
                        <motion.div
                            initial={{ opacity: 0, y: 12, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.96 }}
                            className="w-[360px] max-w-[94vw] bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col"
                            data-testid="voice-chat-panel"
                        >
                            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-slate-50">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <ManagerCharacter mood={characterMood} size={40} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                            Jarvis
                                        </p>
                                        <p className="text-[10px] text-slate-500">
                                            {busy
                                                ? (phase === 'listening' ? 'Listening…' : phase === 'thinking' ? 'Thinking…' : 'Speaking…')
                                                : 'Your AI manager · type or talk'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setStagePresence((v) => !v)}
                                        className={`text-[10px] font-medium px-2 py-1 rounded-full border transition-colors ${
                                            stagePresence
                                                ? 'bg-teal-800 text-white border-teal-800'
                                                : 'bg-white text-teal-800 border-teal-200 hover:bg-teal-50'
                                        }`}
                                        title="Show Jarvis on screen"
                                        data-testid="jarvis-stage-toggle"
                                    >
                                        {stagePresence ? 'On screen' : 'Show me'}
                                    </button>
                                    <button type="button" onClick={closePanel} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Close">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div ref={listRef} className="h-64 overflow-y-auto px-3.5 py-3 space-y-2.5 bg-slate-50/50">
                                {messages.length === 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            Ask about tasks, how something works, or say
                                            {' '}<span className="font-medium text-teal-800">&ldquo;guide me&rdquo;</span>
                                            {' '}to bring me on screen.
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {['What\'s outstanding?', 'How do I assign a task?', 'Guide me'].map((chip) => (
                                                <button
                                                    key={chip}
                                                    type="button"
                                                    onClick={() => sendCommand(chip, { speakReply: false })}
                                                    className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-800 transition-colors"
                                                >
                                                    {chip}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
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
                                        phase === 'listening' ? 'bg-red-500 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
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
                                    className="flex-1 min-w-0 border border-slate-200 rounded-full px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300/60"
                                    placeholder="Ask Jarvis…"
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
                                    className="h-9 w-9 rounded-full bg-teal-800 text-white flex items-center justify-center disabled:opacity-40 hover:bg-teal-900"
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
                    className={`h-14 w-14 rounded-full flex items-center justify-center overflow-hidden shadow-xl transition-colors ring-2 ring-white ${
                        open ? 'bg-teal-900' : phase === 'listening' ? 'bg-red-500' : 'bg-gradient-to-br from-teal-800 to-slate-900'
                    }`}
                    title="Jarvis — AI manager"
                    aria-label="Open Jarvis"
                >
                    {phase === 'thinking' ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                    ) : (
                        <ManagerCharacter mood={characterMood} size={52} />
                    )}
                </motion.button>
            </div>
        </>
    );
};

export default VoiceMode;
