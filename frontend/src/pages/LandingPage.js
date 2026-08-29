import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, MessageSquare, Send, ChevronDown } from 'lucide-react';
import { useAuth, API } from '@/App';
import { distillLandingPrompt } from '@/lib/demoDistill';
import LandingScreenRecorder from '@/components/LandingScreenRecorder';
import LandingVoiceGuide from '@/components/LandingVoiceGuide';
import { rememberGuestSession } from '@/lib/guestSession';
import { recordingFilename } from '@/lib/recordingCapabilities';
import { uploadBlob } from '@/lib/upload';
import { trackLandingView, trackLandingInteract, sessionId } from '@/lib/productAnalytics';
import {
    LANDING_EXAMPLES,
    PROMPT_SEGMENT_CLASS,
    colorizeAssignPrompt,
} from '@/lib/landingAssignDemo';
import { pinDocumentTheme, restoreDocumentTheme } from '@/lib/theme';

const ColorCodedPrompt = ({ text, className = '', testId, as: Tag = 'p' }) => (
    <Tag className={className} data-testid={testId}>
        {colorizeAssignPrompt(text).map((part, i) => (
            <span key={`${part.kind}-${i}`} className={PROMPT_SEGMENT_CLASS[part.kind] || PROMPT_SEGMENT_CLASS.plain}>
                {part.text}
            </span>
        ))}
    </Tag>
);

const LaunchPad = ({ recordingBlob, inputRef, ideaIndex, value, setValue }) => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [assignee, setAssignee] = useState('');
    const [channel, setChannel] = useState('email');
    const [sending, setSending] = useState(false);

    const filled = Boolean(value.trim());
    const preview = distillLandingPrompt(filled ? value : '');
    const idea = LANDING_EXAMPLES[ideaIndex] || LANDING_EXAMPLES[0];

    const pickExample = (text) => {
        setValue(text);
        trackLandingInteract('sample');
        inputRef?.current?.focus();
    };

    const attachRecording = async (taskId) => {
        if (!recordingBlob) return;
        try {
            const filename = recordingFilename(recordingBlob.type, 'walkthrough');
            const ref = await uploadBlob(recordingBlob, filename, recordingBlob.type || 'video/webm');
            await axios.post(`${API}/recordings/standalone`, {
                recording_url: ref.storage_path || ref.path,
                task_id: taskId,
                size_bytes: recordingBlob.size,
                mime_type: recordingBlob.type,
                title: 'Walkthrough for your ask',
            });
        } catch {
            toast.info('Your walkthrough stayed on this device - you can attach it from the task.');
        }
    };

    const sendIt = async () => {
        const text = value.trim() || idea.text;
        if (!text) return;
        if (!value.trim()) setValue(text);
        setSending(true);
        try {
            const { data } = await axios.post(`${API}/demo/launch`, {
                task: text,
                assignee_email: assignee.trim() || undefined,
                channel,
                session_id: sessionId(),
            });
            rememberGuestSession(data.user?.id, data.task_id);
            login(data.access_token, data.user);
            await attachRecording(data.task_id);
            navigate(data.environment_url || `/env/${data.task_id}`);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Could not send that - try again.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto flex flex-col" data-testid="landing-tryit">
            <section
                className="landing-step flex flex-col justify-center"
                data-testid="landing-step-ask"
                id="landing-step-ask"
            >
                <p className="text-[11px] text-white/30 mb-3" data-testid="landing-no-account">
                    No account. No password. Enter sends it.
                </p>
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-4">
                    1 · What needs to get done
                </p>

                <div className={`relative border-l-2 border-teal-400/50 pl-5 ${filled ? 'min-h-[180px] sm:min-h-[220px]' : 'min-h-[7.5rem] sm:min-h-[8.5rem]'}`}>
                    {!filled && (
                        <div
                            className="landing-example pointer-events-none absolute inset-0 text-2xl sm:text-3xl font-medium leading-snug"
                            data-testid={`landing-example-${idea.id}`}
                            aria-hidden
                        >
                            <ColorCodedPrompt text={idea.text} as="span" />
                        </div>
                    )}
                    <textarea
                        ref={inputRef}
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value);
                            if (e.target.value.trim()) trackLandingInteract('typed');
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendIt();
                            }
                        }}
                        rows={filled ? 6 : 4}
                        className={`relative w-full h-full resize-none bg-transparent text-2xl sm:text-3xl font-medium leading-snug outline-none caret-teal-300 text-white selection:bg-teal-400/30 ${filled ? 'min-h-[180px] sm:min-h-[220px]' : 'min-h-[7.5rem] sm:min-h-[8.5rem]'}`}
                        placeholder=""
                        data-testid="landing-tryit-input"
                        aria-label="What needs to get done"
                        autoFocus
                    />
                </div>
                {!filled && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3" data-testid="landing-examples">
                        <button
                            type="button"
                            onClick={() => pickExample(idea.text)}
                            className="text-sm text-teal-200/80 hover:text-teal-100"
                            data-testid="landing-use-idea"
                        >
                            Use this idea
                        </button>
                        <div className="flex gap-1" aria-hidden>
                            {LANDING_EXAMPLES.map((ex, i) => (
                                <span
                                    key={ex.id}
                                    className={`h-1.5 w-1.5 rounded-full ${i === ideaIndex ? 'bg-teal-300' : 'bg-white/20'}`}
                                />
                            ))}
                        </div>
                    </div>
                )}
                {filled && (
                    <ColorCodedPrompt
                        text={value}
                        className="mt-4 text-sm leading-relaxed"
                        testId="landing-tryit-colorized"
                    />
                )}
                <a
                    href="#landing-step-who"
                    className="mt-8 inline-flex items-center gap-1.5 text-xs text-white/35 hover:text-white/70 self-start"
                >
                    Next: who should get it <ChevronDown className="w-3.5 h-3.5" />
                </a>
            </section>

            <section
                className="landing-step flex flex-col justify-center"
                data-testid="landing-step-who"
                id="landing-step-who"
            >
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-4">
                    2 · Who should get it
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1">
                        <label className="text-[11px] uppercase tracking-[0.22em] text-white/40">To</label>
                        <Input
                            type="email"
                            value={assignee}
                            onChange={(e) => setAssignee(e.target.value)}
                            placeholder="name@company.com"
                            className="mt-1 h-12 rounded-none border-0 border-b border-white/15 bg-transparent px-0 text-lg text-white placeholder:text-white/25 focus-visible:ring-0 focus-visible:border-teal-400/70"
                            data-testid="landing-assignee-email"
                            aria-label="Assignee email"
                        />
                    </div>
                    <div className="flex items-center gap-1" data-testid="landing-channel">
                        <button
                            type="button"
                            onClick={() => setChannel('email')}
                            className={`h-10 px-3 text-xs font-medium inline-flex items-center gap-1.5 border-b-2 ${channel === 'email' ? 'border-teal-400 text-teal-200' : 'border-transparent text-white/40 hover:text-white/70'}`}
                            data-testid="landing-channel-email"
                        >
                            <Mail className="w-3.5 h-3.5" /> Email
                        </button>
                        <button
                            type="button"
                            onClick={() => setChannel('slack')}
                            className={`h-10 px-3 text-xs font-medium inline-flex items-center gap-1.5 border-b-2 ${channel === 'slack' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/70'}`}
                            data-testid="landing-channel-slack"
                        >
                            <MessageSquare className="w-3.5 h-3.5" /> Slack
                        </button>
                    </div>
                </div>
                <p className="mt-4 text-sm text-white/40">
                    Optional. Leave it blank if you just want to see how an ask looks.
                </p>
                <a
                    href="#landing-step-send"
                    className="mt-8 inline-flex items-center gap-1.5 text-xs text-white/35 hover:text-white/70 self-start"
                >
                    Next: send it <ChevronDown className="w-3.5 h-3.5" />
                </a>
            </section>

            <section
                className="landing-step flex flex-col justify-center"
                data-testid="landing-step-send"
                id="landing-step-send"
            >
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-4">
                    3 · Send it
                </p>
                <div className="pt-2 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-t border-white/10">
                    <div data-testid="landing-tryit-result" className="min-w-0">
                        {preview && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35 mb-1">They receive</p>
                                <p className="text-sm text-white/80 leading-relaxed truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {preview.title}
                                    <span className="text-white/40"> · {assignee.trim() || preview.who} · {preview.when}</span>
                                </p>
                            </motion.div>
                        )}
                        <p className={`text-xs text-white/40 ${preview ? 'mt-2' : ''}`} data-testid="landing-send-promise">
                            {channel === 'slack'
                                ? 'First ask goes by email. Connect Slack later if you want follow-up there.'
                                : 'They get the ask. TskFlow follows up and shows you what happened.'}
                        </p>
                    </div>
                    <Button
                        type="button"
                        className="rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 h-12 px-7 shrink-0"
                        onClick={sendIt}
                        disabled={sending}
                        data-testid="landing-send-it"
                    >
                        <Send className="w-4 h-4 mr-2" />
                        {sending ? 'Opening…' : 'Send it'}
                    </Button>
                </div>
            </section>
        </div>
    );
};

const LandingPage = () => {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const [recordingBlob, setRecordingBlob] = useState(null);
    const [ideaIndex, setIdeaIndex] = useState(0);
    const [value, setValue] = useState('');

    useEffect(() => {
        trackLandingView({ path: '/' });
    }, []);

    useEffect(() => {
        pinDocumentTheme('dark');
        document.body.classList.add('landing-active');
        const t = window.setTimeout(() => inputRef.current?.focus(), 40);
        return () => {
            window.clearTimeout(t);
            document.body.classList.remove('landing-active');
            restoreDocumentTheme();
        };
    }, []);

    useEffect(() => {
        const id = window.setInterval(() => {
            setIdeaIndex((i) => (i + 1) % LANDING_EXAMPLES.length);
        }, 3800);
        return () => window.clearInterval(id);
    }, []);

    const scrollToStep = (step) => {
        const id = step === 'who' ? 'landing-step-who' : 'landing-step-ask';
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (step === 'ask') window.setTimeout(() => inputRef.current?.focus(), 280);
    };

    return (
        <div className="landing-page landing-tool min-h-screen text-white flex flex-col" style={{ background: '#050807' }} data-testid="landing-page">
            <header className="relative z-20 shrink-0 sticky top-0 bg-[#050807]/90 backdrop-blur-sm" data-testid="landing-toolbar">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 sm:h-[4.5rem] flex items-center gap-3">
                    <LandingScreenRecorder
                        onRecorded={setRecordingBlob}
                        recorded={Boolean(recordingBlob)}
                        prominent
                    />
                    <span
                        className="text-sm font-semibold tracking-tight text-white/70 ml-1"
                        style={{ fontFamily: 'Outfit, sans-serif' }}
                        data-testid="landing-brand"
                    >
                        TskFlow
                    </span>
                    <div className="ml-auto flex items-center gap-1 sm:gap-2">
                        <LandingVoiceGuide
                            inputValue={value}
                            onHeard={(text) => {
                                setValue(text);
                                trackLandingInteract('voice');
                            }}
                            onAfterGuide={scrollToStep}
                        />
                        <Button
                            variant="ghost"
                            className="rounded-full text-white/70 hover:text-white hover:bg-white/10 h-10"
                            onClick={() => navigate('/login')}
                            data-testid="landing-sign-in"
                        >
                            Sign in
                        </Button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 flex-1 flex flex-col px-4 sm:px-6">
                <LaunchPad
                    recordingBlob={recordingBlob}
                    inputRef={inputRef}
                    ideaIndex={ideaIndex}
                    value={value}
                    setValue={setValue}
                />
            </main>

            <footer className="relative z-10 shrink-0 border-t border-white/8 py-4">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-white/35">
                    <span>
                        <span className="font-medium text-white/50" style={{ fontFamily: 'Outfit, sans-serif' }}>TskFlow</span>
                        {' '}is a trade name of Unbiassly, Inc.
                    </span>
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                        <Link to="/contact" className="hover:text-white/70">Contact</Link>
                        <Link to="/legal" className="hover:text-white/70">Legal</Link>
                        <Link to="/privacy" className="hover:text-white/70">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-white/70">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
