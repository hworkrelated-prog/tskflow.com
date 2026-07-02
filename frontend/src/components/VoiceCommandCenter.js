import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, X, Loader2, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const getRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    return rec;
};

export const VoiceCommandCenter = ({ onAction }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState('idle'); // idle | listening | thinking | speaking
    const [transcript, setTranscript] = useState('');
    const [reply, setReply] = useState('');
    const [supported, setSupported] = useState(true);
    const recRef = useRef(null);

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
        setPhase('thinking');
        try {
            const res = await axios.post(`${API}/voice/command`, { transcript: text });
            const { reply: r, action, executed } = res.data;
            setReply(r);
            speak(r);
            // Execute navigation client-side
            if (action?.type === 'navigate') {
                const target = action.params?.target;
                const route = { dashboard: '/dashboard', analytics: '/analytics', team: '/team', settings: '/settings', leads: '/leads' }[target];
                if (route) setTimeout(() => navigate(route), 600);
            }
            if (['create_task', 'assign_task', 'update_status'].includes(action?.type) && executed) {
                if (onAction) onAction();
            }
        } catch (err) {
            const msg = 'Sorry, I had trouble with that. Please try again.';
            setReply(msg);
            speak(msg);
        }
    }, [navigate, onAction, speak]);

    const startListening = () => {
        const rec = getRecognition();
        if (!rec) { setSupported(false); return; }
        recRef.current = rec;
        setTranscript('');
        setReply('');
        setPhase('listening');
        rec.onresult = (e) => {
            const text = e.results[0][0].transcript;
            setTranscript(text);
            sendCommand(text);
        };
        rec.onerror = (e) => {
            setPhase('idle');
            if (e.error === 'not-allowed') toast.error('Microphone permission denied');
        };
        rec.onend = () => { setPhase((p) => (p === 'listening' ? 'idle' : p)); };
        try { rec.start(); } catch (e) { /* already started */ }
    };

    const stopListening = () => {
        if (recRef.current) { try { recRef.current.stop(); } catch (e) { /* noop */ } }
        setPhase('idle');
    };

    const closeAll = () => {
        stopListening();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setOpen(false);
        setPhase('idle');
    };

    const phaseText = {
        idle: 'Tap the mic and ask me anything',
        listening: 'Listening...',
        thinking: 'Thinking...',
        speaking: 'Speaking...',
    }[phase];

    return (
        <>
            {/* Floating voice button */}
            <button
                data-testid="voice-command-button"
                onClick={() => setOpen(true)}
                className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center hover:scale-105 transition-transform"
                title="Voice assistant"
            >
                <Mic className="w-6 h-6" />
            </button>

            <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : closeAll())}>
                <DialogContent className="rounded-3xl max-w-md text-center p-8" data-testid="voice-modal">
                    <button onClick={closeAll} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Outfit' }}>Voice Assistant</h2>
                    <p className="text-sm text-muted-foreground mb-6">{supported ? phaseText : 'Voice input is not supported in this browser. Try Chrome.'}</p>

                    <div className="flex items-center justify-center mb-6">
                        <motion.button
                            data-testid="voice-mic-toggle"
                            onClick={phase === 'listening' ? stopListening : startListening}
                            disabled={!supported || phase === 'thinking'}
                            animate={phase === 'listening' ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                            transition={phase === 'listening' ? { repeat: Infinity, duration: 1.2 } : {}}
                            className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-xl transition-colors ${phase === 'listening' ? 'bg-red-500' : phase === 'thinking' ? 'bg-slate-400' : 'bg-gradient-to-br from-indigo-600 to-purple-600'}`}
                        >
                            {phase === 'thinking' ? <Loader2 className="w-10 h-10 animate-spin" /> : phase === 'speaking' ? <Volume2 className="w-10 h-10" /> : phase === 'listening' ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
                        </motion.button>
                    </div>

                    {transcript && (
                        <div className="text-left bg-slate-50 rounded-xl p-3 mb-3">
                            <p className="text-xs text-muted-foreground mb-1">You said</p>
                            <p className="text-sm">{transcript}</p>
                        </div>
                    )}
                    {reply && (
                        <div className="text-left bg-indigo-50 rounded-xl p-3">
                            <p className="text-xs text-indigo-500 mb-1">Assistant</p>
                            <p className="text-sm text-indigo-900">{reply}</p>
                        </div>
                    )}

                    <div className="mt-6 text-xs text-muted-foreground">
                        Try: &ldquo;What&apos;s outstanding?&rdquo; · &ldquo;Create a task to call the vendor tomorrow&rdquo; · &ldquo;Open analytics&rdquo;
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default VoiceCommandCenter;
