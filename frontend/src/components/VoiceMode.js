import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, X, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, API } from '@/App';
import { JarvisIcon } from '@/components/JarvisIcon';
import { captureVisibleScreenContext } from '@/lib/screenContext';

import { createDictationSession } from '@/lib/promptVoice';

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

/** Prefer natural-sounding system voices over the default robotic one. */
const pickNaturalVoice = () => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const rank = (v) => {
        const n = `${v.name} ${v.lang}`.toLowerCase();
        let score = 0;
        if (/en(-|_)?(us|gb|au)/i.test(v.lang)) score += 10;
        if (/google|microsoft|samantha|aria|jenny|guy|natural|neural|premium|enhanced/i.test(n)) score += 8;
        if (/zira|david|mark|susan|female|male/i.test(n)) score += 2;
        if (/compact|espeak|robot/i.test(n)) score -= 10;
        return score;
    };
    return [...voices].sort((a, b) => rank(b) - rank(a))[0] || null;
};

const forSpeech = (text) =>
    (text || '')
        .replace(/[•●▪︎]/g, '')
        .replace(/\*\*?/g, '')
        .replace(/[_#`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

/** Offline-safe answers when the API/proxy fails entirely */
const localJarvisReply = (text) => {
    const t = (text || '').trim();
    if (/\b(what can you (do|help with)|who are you|what do you do|help me get started)\b/i.test(t)) {
        return {
            reply:
                "I can assign, list what's open, and jump you to a page. What do you need?",
            action: { type: 'assistant_answer' },
        };
    }
    if (/\b(guide me|show yourself|show me|help me|walk me through)\b/i.test(t) && t.length < 80) {
        return {
            reply: "What are you stuck on?",
            action: { type: 'assistant_answer' },
        };
    }
    return null;
};

const StatusDot = ({ phase }) => {
    const color =
        phase === 'listening' ? 'bg-red-500'
            : phase === 'thinking' ? 'bg-amber-400'
                : phase === 'speaking' ? 'bg-teal-500'
                    : 'bg-emerald-400';
    return (
        <span className="relative flex h-2 w-2 shrink-0">
            {(phase === 'listening' || phase === 'speaking') && (
                <span className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-60 animate-ping`} />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
        </span>
    );
};

const VoiceMode = ({ dockIntegrated = false }) => {
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
    const [voiceReady, setVoiceReady] = useState(false);
    const dictationRef = useRef(null);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const nudgeTimer = useRef(null);
    const messagesRef = useRef([]);
    const voiceRef = useRef(null);
    const speakQueueRef = useRef([]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) setSupported(false);
    }, []);

    useEffect(() => {
        if (!('speechSynthesis' in window)) return undefined;
        const load = () => {
            voiceRef.current = pickNaturalVoice();
            setVoiceReady(true);
        };
        load();
        window.speechSynthesis.addEventListener('voiceschanged', load);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
    }, []);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages, phase]);

    const speak = useCallback((text) => {
        if (!('speechSynthesis' in window) || !text) return;
        window.speechSynthesis.cancel();
        speakQueueRef.current = [];

        const cleaned = forSpeech(text);
        // Speak in short beats so it feels conversational, not one flat drone
        const chunks = cleaned
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const parts = chunks.length ? chunks : [cleaned];

        const voice = voiceRef.current || pickNaturalVoice();
        let i = 0;
        const next = () => {
            if (i >= parts.length) {
                setPhase('idle');
                return;
            }
            const u = new SpeechSynthesisUtterance(parts[i]);
            i += 1;
            if (voice) u.voice = voice;
            u.rate = 1.02;
            u.pitch = 1.0;
            u.volume = 1;
            u.onstart = () => setPhase('speaking');
            u.onend = () => {
                // Tiny pause between sentences
                setTimeout(next, 90);
            };
            u.onerror = () => setPhase('idle');
            window.speechSynthesis.speak(u);
        };
        next();
        // voiceschanged may fire late on some browsers
        if (!voiceReady) setTimeout(() => {
            if (!voiceRef.current) voiceRef.current = pickNaturalVoice();
        }, 50);
    }, [voiceReady]);

    const sendCommand = useCallback(async (text, { speakReply = true, screenContext = null } = {}) => {
        const trimmed = (text || '').trim();
        if (!trimmed) return;
        const userMsg = { id: `${Date.now()}-u`, role: 'user', text: trimmed };
        const historyPayload = [...messagesRef.current, userMsg]
            .slice(-12)
            .map((m) => ({ role: m.role, text: m.text }));
        setMessages((prev) => [...prev, userMsg]);
        setPhase('thinking');
        setOpen(true);
        setNudge(false);
        setWiggle(false);

        const applyReply = (replyText, action, executed) => {
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
        };

        try {
            const payload = { transcript: trimmed, history: historyPayload };
            if (screenContext) payload.screen_context = screenContext;
            const res = await axios.post(
                `${API}/voice/command`,
                payload,
                { timeout: 20000 },
            );
            const { reply: r, action, executed } = res.data || {};
            applyReply(r || 'Okay.', action, executed);
        } catch (err) {
            if (screenContext) {
                const clarify = screenContext.clarifying_question;
                const preview = screenContext.ai_preview_title;
                const composer = screenContext.ai_composer;
                const err0 = (screenContext.errors || [])[0];
                let offlineHelp = "I can see your screen snapshot locally. Fill assignee and due date in the AI bar, then send - or tell me the field you're stuck on.";
                if (clarify) offlineHelp = `Looks like you're stuck on: “${String(clarify).slice(0, 160)}”. Answer that in the AI bar, then continue.`;
                else if (err0) offlineHelp = `I see an error: “${String(err0).slice(0, 140)}”. Fix that first, then try again.`;
                else if (preview) offlineHelp = `You've got a draft titled “${String(preview).slice(0, 80)}”. Check assignee and due date, then hit Send task.`;
                else if (composer) offlineHelp = `You've typed “${String(composer).slice(0, 100)}” - add @assignee and a due date, then create the task.`;
                applyReply(offlineHelp, { type: 'assistant_answer' }, { type: 'assistant_answer', offline: true, screen_help: true });
                return;
            }
            const fallback = localJarvisReply(trimmed);
            if (fallback) {
                applyReply(fallback.reply, fallback.action, { type: fallback.action?.type, offline: true });
                return;
            }
            const status = err?.response?.status;
            const raw = err?.response?.data?.detail ?? err?.response?.data ?? err?.message;
            const asText = typeof raw === 'string'
                ? raw
                : (Array.isArray(raw) ? raw.map((x) => x?.msg || JSON.stringify(x)).join('; ') : '');
            const looksLikeProxy = !status || status >= 502 || /cloudflare|origin web server|bad gateway|gateway time|<!doctype|<html/i.test(asText || '');
            const msg = looksLikeProxy
                ? "The server didn't finish that one. Try “what's outstanding”, or type a task in the bar below."
                : (asText || 'Sorry - I had trouble with that. Try again?').slice(0, 280);
            setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: 'assistant', text: msg }]);
            setPhase('idle');
        }
    }, [navigate, speak]);

    const getDictation = useCallback(() => {
        if (!dictationRef.current) {
            dictationRef.current = createDictationSession({
                getDisplayed: () => inputRef.current?.value || '',
                getSeed: () => '',
                onTranscript: ({ spoken, shown }) => setTextInput(shown || spoken || ''),
            });
        }
        return dictationRef.current;
    }, []);

    const stopListening = useCallback(() => {
        getDictation().stop({ commit: false });
        setPhase((p) => (p === 'listening' ? 'idle' : p));
    }, [getDictation]);

    const startListening = useCallback(() => {
        if (!supported) {
            toast.error('Voice not supported here - type instead.');
            inputRef.current?.focus();
            return;
        }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        const result = getDictation().start({
            onCommit: (t) => {
                setPhase('idle');
                setTextInput('');
                sendCommand(t);
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
        setOpen(true);
    }, [getDictation, sendCommand, supported]);

    const openPanel = useCallback(() => {
        setOpen(true);
        setNudge(false);
        setWiggle(false);
        setTimeout(() => inputRef.current?.focus(), 80);
    }, []);

    const askHelpFromScreen = useCallback(() => {
        setNudge(false);
        setWiggle(false);
        setOpen(true);
        let ctx = null;
        try { ctx = captureVisibleScreenContext(); } catch { ctx = null; }
        const prompt =
            "I need help with what's on my screen right now. Figure out what I'm stuck on and give a concrete next step.";
        sendCommand(prompt, { speakReply: true, screenContext: ctx });
    }, [sendCommand]);

    const closePanel = useCallback(() => {
        stopListening();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setPhase('idle');
        setOpen(false);
    }, [stopListening]);

    useEffect(() => {
        const onNudge = (e) => {
            window.dispatchEvent(new CustomEvent('tskflow:focus-ai-prompt'));
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
        const onOpen = () => {
            window.dispatchEvent(new CustomEvent('tskflow:focus-ai-prompt'));
            if (!dockIntegrated) openPanel();
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
                window.dispatchEvent(new CustomEvent('tskflow:focus-ai-prompt'));
                window.dispatchEvent(new CustomEvent('tskflow:start-prompt-voice'));
                if (dockIntegrated) return;
                if (open && phase === 'listening') stopListening();
                else if (open) startListening();
                else openPanel();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, phase, openPanel, startListening, stopListening, dockIntegrated]);

    useEffect(() => () => {
        stopListening();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }, [stopListening]);

    if (!user) return null;
    const hiddenPaths = ['/login', '/register', '/verify-email', '/forgot-password'];
    if (hiddenPaths.includes(location.pathname)) return null;

    const busy = phase === 'thinking' || phase === 'listening' || phase === 'speaking';
    const statusLabel =
        phase === 'listening' ? 'Listening'
            : phase === 'thinking' ? 'Thinking'
                : phase === 'speaking' ? 'Speaking'
                    : 'Ready';

    const submitText = () => {
        const t = textInput.trim();
        if (!t || phase === 'thinking') return;
        setTextInput('');
        sendCommand(t, { speakReply: false });
    };

    // Jarvis lives in the prompt bar. This shell only keeps shortcuts + nudges.
    if (dockIntegrated) {
        return null;
    }

    return (
        <div
            className={`ai-jarvis-anchor flex flex-col items-end gap-2 max-w-[calc(100vw-1.5rem)]${
                dockIntegrated ? '' : ' fixed z-[45] safe-fab-br'
            }`}
            data-testid="voice-mode-widget"
        >
            <AnimatePresence>
                {nudge && !open && (
                    <motion.button
                        type="button"
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6 }}
                        onClick={askHelpFromScreen}
                        className="max-w-[min(240px,calc(100vw-5.5rem))] text-left text-xs bg-white/95 backdrop-blur border border-slate-200/80 shadow-lg rounded-2xl px-3 py-2.5 text-slate-700 hover:bg-white flex items-center gap-2.5"
                        data-testid="voice-nudge-bubble"
                    >
                        <JarvisIcon phase="idle" size={28} />
                        <span>{typeof nudge === 'string' ? nudge : 'Need a hand?'} Tap for on-screen help.</span>
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.96 }}
                        className="ai-jarvis-panel w-[min(24rem,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col"
                        data-testid="voice-chat-panel"
                    >
                        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100 bg-white">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <JarvisIcon phase={phase} size={36} />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                        Jarvis
                                    </p>
                                    <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                        <StatusDot phase={phase} />
                                        {busy ? statusLabel : 'AI manager · type or talk'}
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={closePanel} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Close">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div ref={listRef} className="h-64 overflow-y-auto px-3.5 py-3 space-y-2.5 bg-slate-50/40">
                            {messages.length === 0 && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1.5">
                                        {["What's outstanding?", 'How do I assign a task?', 'What can you do?'].map((chip) => (
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
                animate={wiggle ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                transition={wiggle ? { duration: 0.45 } : { duration: 0.15 }}
                className={`ai-jarvis-orb relative flex items-center justify-center rounded-full ring-1 ring-white/70 ${
                    dockIntegrated
                        ? 'h-11 w-11 shadow-[0_8px_22px_rgba(13,148,136,0.28)]'
                        : 'h-14 w-14 shadow-[0_12px_32px_rgba(13,148,136,0.35)]'
                }`}
                title="Jarvis - AI manager"
                aria-label="Open Jarvis"
            >
                <JarvisIcon
                    phase={open && phase === 'idle' ? 'idle' : phase}
                    size={dockIntegrated ? 44 : 56}
                    showRing
                />
            </motion.button>
        </div>
    );
};

export default VoiceMode;
