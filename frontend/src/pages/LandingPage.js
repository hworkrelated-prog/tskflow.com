import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Mail, MessageSquare, Send } from 'lucide-react';
import { useAuth, API } from '@/App';
import { distillLandingPrompt } from '@/lib/demoDistill';
import LandingScreenRecorder from '@/components/LandingScreenRecorder';
import LandingHeroStory from '@/components/LandingHeroStory';
import LandingWeek from '@/components/LandingWeek';
import LandingCost from '@/components/LandingCost';
import LandingDifference from '@/components/LandingDifference';
import LandingBeforeAfter from '@/components/LandingBeforeAfter';
import LandingPayoff from '@/components/LandingPayoff';
import LandingFounder from '@/components/LandingFounder';
import LandingUnbiassly from '@/components/LandingUnbiassly';
import TskFlowLogo from '@/components/TskFlowLogo';
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

const scrollToId = (id) => {
    const node = document.getElementById(id);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const ColorCodedPrompt = ({ text, className = '', testId, as: Tag = 'p' }) => (
    <Tag className={className} data-testid={testId}>
        {colorizeAssignPrompt(text).map((part, i) => (
            <span key={`${part.kind}-${i}`} className={PROMPT_SEGMENT_CLASS[part.kind] || PROMPT_SEGMENT_CLASS.plain}>
                {part.text}
            </span>
        ))}
    </Tag>
);

const LaunchPad = ({ recordingBlob, inputRef, ideaIndex, value, setValue, setIdeaIndex }) => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [assignee, setAssignee] = useState('');
    const [channel, setChannel] = useState('email');
    const [sending, setSending] = useState(false);
    const [whoNeeded, setWhoNeeded] = useState(false);

    const filled = Boolean(value.trim());
    const preview = distillLandingPrompt(filled ? value : '');
    const idea = LANDING_EXAMPLES[ideaIndex] || LANDING_EXAMPLES[0];

    const pickExample = (ex) => {
        setValue(ex.text);
        setIdeaIndex(LANDING_EXAMPLES.findIndex((item) => item.id === ex.id));
        trackLandingInteract('sample');
        window.setTimeout(() => document.getElementById('landing-assignee-email')?.focus(), 40);
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
            toast.info('Attach it from the task.');
        }
    };

    const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

    const focusEmail = () => {
        document.getElementById('landing-assignee-email')?.focus();
        setWhoNeeded(!looksLikeEmail(assignee));
    };

    const sendIt = async () => {
        const text = value.trim() || idea.text;
        if (!text) return;
        if (!looksLikeEmail(assignee)) {
            toast.error('Add your email to try it.');
            focusEmail();
            return;
        }
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
        <div className="w-full max-w-3xl mx-auto flex flex-col" data-testid="landing-tryit" id="landing-tryit">
            <div className="landing-composer rounded-[28px] border border-white/12 bg-black/35 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md px-4 sm:px-6 py-6 sm:py-7">
            <section
                className="landing-step flex flex-col justify-center"
                data-testid="landing-step-ask"
                id="landing-step-ask"
            >
                <p className="landing-step-kicker">Ask</p>
                <p className="landing-step-hint">Type what needs to get done. Or tap an example.</p>
                <div className="landing-ask-box">
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
                                focusEmail();
                            }
                        }}
                        rows={filled ? 4 : 3}
                        className="landing-ask-input relative w-full resize-none bg-transparent font-medium leading-relaxed outline-none caret-teal-300 text-white selection:bg-teal-400/30"
                        placeholder={idea.text}
                        data-testid="landing-tryit-input"
                        aria-label="What needs to get done"
                    />
                    <div className="landing-ask-actions" data-testid="landing-examples">
                        {LANDING_EXAMPLES.map((ex, i) => (
                            <button
                                key={ex.id}
                                type="button"
                                onClick={() => pickExample(ex)}
                                className={`landing-example-chip${i === ideaIndex ? ' is-on' : ''}`}
                                data-testid={`landing-example-${ex.id}`}
                            >
                                {ex.chip}
                            </button>
                        ))}
                    </div>
                    {filled && (
                        <ColorCodedPrompt
                            text={value}
                            className="landing-ask-parsed"
                            testId="landing-tryit-colorized"
                        />
                    )}
                </div>
            </section>

            <section
                className="landing-step landing-who-step flex flex-col justify-center"
                data-testid="landing-step-who"
                id="landing-step-who"
            >
                <p className="landing-step-kicker">Who</p>
                <p className="sr-only" data-testid="landing-who-cue">
                    Your email. To try it.
                </p>
                <p className="landing-step-hint">Your email. No password. We send the ask from here.</p>
                <Input
                    type="email"
                    value={assignee}
                    onChange={(e) => {
                        setAssignee(e.target.value);
                        if (whoNeeded) setWhoNeeded(false);
                    }}
                    placeholder="you@company.com"
                    className={`landing-who-input ${whoNeeded ? 'is-needed' : ''}`}
                    data-testid="landing-assignee-email"
                    id="landing-assignee-email"
                    aria-label="Your email"
                    autoComplete="email"
                />
                <div className="landing-channel-row" data-testid="landing-channel">
                    <button
                        type="button"
                        onClick={() => setChannel('email')}
                        className={channel === 'email' ? 'is-on' : ''}
                        data-testid="landing-channel-email"
                    >
                        <Mail className="w-3.5 h-3.5" /> Email
                    </button>
                    <button
                        type="button"
                        onClick={() => setChannel('slack')}
                        className={channel === 'slack' ? 'is-on' : ''}
                        data-testid="landing-channel-slack"
                    >
                        <MessageSquare className="w-3.5 h-3.5" /> Slack
                    </button>
                </div>
            </section>

            <section
                className="landing-step flex flex-col justify-center"
                data-testid="landing-step-send"
                id="landing-step-send"
            >
                <p className="landing-step-kicker">Send</p>
                <div className="landing-send-row">
                    <div data-testid="landing-tryit-result" className="min-w-0">
                        {preview && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <p className="text-sm text-white/80 leading-relaxed truncate" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {preview.title}
                                    <span className="text-white/40"> · {assignee.trim() || preview.who} · {preview.when}</span>
                                </p>
                            </motion.div>
                        )}
                        <p className="sr-only" data-testid="landing-no-account">
                            No account. No password.
                        </p>
                        <p className="landing-send-visual" data-testid="landing-send-promise">
                            We send it. If they go quiet, we follow up.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="landing-cta landing-send-cta"
                        onClick={sendIt}
                        disabled={sending}
                        data-testid="landing-send-it"
                    >
                        <Send className="w-4 h-4" />
                        {sending ? 'Opening…' : 'Send it'}
                    </button>
                </div>
            </section>
            </div>
        </div>
    );
};

const LandingPage = () => {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const [recordingBlob, setRecordingBlob] = useState(null);
    const [ideaIndex, setIdeaIndex] = useState(0);
    const [value, setValue] = useState('');
    const [tab, setTab] = useState('story');

    useEffect(() => {
        trackLandingView({ path: '/' });
    }, []);

    useEffect(() => {
        pinDocumentTheme('dark');
        document.body.classList.add('landing-active');
        return () => {
            document.body.classList.remove('landing-active');
            restoreDocumentTheme();
        };
    }, []);

    useEffect(() => {
        if (value.trim()) return undefined;
        const id = window.setInterval(() => {
            setIdeaIndex((i) => (i + 1) % LANDING_EXAMPLES.length);
        }, 3800);
        return () => window.clearInterval(id);
    }, [value]);

    return (
        <div className="landing-page landing-tool landing-visual min-h-screen text-white flex flex-col" style={{ background: '#050807' }} data-testid="landing-page">
            <header className="relative z-20 shrink-0 sticky top-0 bg-[#050807]/90 backdrop-blur-sm" data-testid="landing-toolbar">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 landing-toolbar-row flex items-center gap-3">
                    <div className="landing-toolbar-lead">
                        <button
                            type="button"
                            onClick={() => setTab('story')}
                            data-testid="landing-brand"
                            className="landing-brand-btn"
                            aria-label="TskFlow home"
                        >
                            <TskFlowLogo variant="dark" size="sm" />
                        </button>
                        {tab === 'story' ? (
                            <LandingScreenRecorder
                                onRecorded={setRecordingBlob}
                                recorded={Boolean(recordingBlob)}
                            />
                        ) : null}
                    </div>
                    <nav className="landing-tabs ml-auto flex min-w-0" data-testid="landing-tabs">
                        <button
                            type="button"
                            className={tab === 'founder' ? 'is-on' : ''}
                            onClick={() => setTab('founder')}
                            data-testid="landing-tab-founder"
                        >
                            Get to Know the Founder
                        </button>
                        <button
                            type="button"
                            className={tab === 'unbiassly' ? 'is-on' : ''}
                            onClick={() => setTab('unbiassly')}
                            data-testid="landing-unbiassly"
                        >
                            Unbiassly
                        </button>
                    </nav>
                    <div className="landing-toolbar-actions">
                        <button
                            type="button"
                            className="landing-tabs-link"
                            onClick={() => navigate('/login')}
                            data-testid="landing-sign-in"
                        >
                            Sign in
                        </button>
                    </div>
                </div>
            </header>

            <main className="relative z-10 flex-1 flex flex-col">
                {tab === 'founder' ? (
                    <LandingFounder />
                ) : tab === 'unbiassly' ? (
                    <LandingUnbiassly />
                ) : (
                    <>
                <LandingHeroStory
                    onTry={() => scrollToId('landing-tryit')}
                    onHow={() => scrollToId('landing-week')}
                />
                <LandingWeek />
                <LandingCost />
                <LandingDifference />
                <LandingBeforeAfter />
                <LandingPayoff />

                <section className="landing-final" data-testid="landing-final">
                    <p className="landing-section-kicker">Start</p>
                    <h2 className="landing-final-headline" data-testid="landing-final-headline">
                        Stop being the reminder system.
                    </h2>
                    <p className="landing-final-support" data-testid="landing-final-support">
                        Your team already said yes. TskFlow makes sure the commitment doesn't disappear.
                    </p>
                    <div className="landing-final-ctas">
                        <button
                            type="button"
                            className="landing-cta"
                            onClick={() => {
                                scrollToId('landing-tryit');
                                window.setTimeout(() => inputRef.current?.focus?.(), 240);
                            }}
                            data-testid="landing-final-cta"
                        >
                            Start using TskFlow
                        </button>
                        <button
                            type="button"
                            className="landing-cta-ghost"
                            onClick={() => scrollToId('landing-difference')}
                            data-testid="landing-final-how"
                        >
                            See how it works
                        </button>
                    </div>
                    <p className="landing-final-line">Try it. No account. No password.</p>
                    <LaunchPad
                        recordingBlob={recordingBlob}
                        inputRef={inputRef}
                        ideaIndex={ideaIndex}
                        value={value}
                        setValue={setValue}
                        setIdeaIndex={setIdeaIndex}
                    />
                </section>
                    </>
                )}
            </main>

            <footer className="relative z-10 shrink-0 border-t border-white/8 py-4">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-white/35">
                    <span>
                        <span className="font-medium text-white/50" style={{ fontFamily: 'Outfit, sans-serif' }}>TskFlow</span>
                        {' '}is a trade name of Unbiassly, Inc.
                    </span>
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                        <button type="button" className="hover:text-white/70" onClick={() => setTab('unbiassly')} data-testid="landing-unbiassly-footer">Unbiassly</button>
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
