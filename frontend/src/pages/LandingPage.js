import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import axios from 'axios';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { ArrowUp, Loader2, Mail, MessageSquare } from 'lucide-react';
import { useAuth, API } from '@/App';
import { distillLandingPrompt } from '@/lib/demoDistill';
import LandingScreenRecorder from '@/components/LandingScreenRecorder';
import LandingStoryAtmosphere from '@/components/LandingStoryAtmosphere';
import LandingPayoff from '@/components/LandingPayoff';
import LandingFilm from '@/components/LandingFilm';
import LandingFounder from '@/components/LandingFounder';

import LandingUnbiassly from '@/components/LandingUnbiassly';
import TskFlowLogo from '@/components/TskFlowLogo';
import { rememberGuestSession } from '@/lib/guestSession';
import { recordingFilename } from '@/lib/recordingCapabilities';
import { uploadBlob } from '@/lib/upload';
import { trackLandingView, trackLandingInteract, sessionId } from '@/lib/productAnalytics';
import {
    DEMO_PEOPLE,
    LANDING_EXAMPLES,
    PROMPT_SEGMENT_CLASS,
    colorizeAssignPrompt,
    isLargeTeamPrompt,
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

const LaunchPad = ({ recordingBlob, inputRef, ideaIndex, value, setValue }) => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [assignee, setAssignee] = useState('');
    const [channel, setChannel] = useState('email');
    const [sending, setSending] = useState(false);
    const [whoNeeded, setWhoNeeded] = useState(false);

    const filled = Boolean(value.trim());
    const preview = distillLandingPrompt(filled ? value : '');
    const idea = LANDING_EXAMPLES[ideaIndex] || LANDING_EXAMPLES[0];
    const crowd = Boolean(preview?.crowd || (filled && isLargeTeamPrompt(value)));
    const whoLabel = crowd ? `${DEMO_PEOPLE.length} people` : preview?.who;

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
        setWhoNeeded(true);
        window.setTimeout(() => document.getElementById('landing-assignee-email')?.focus(), 40);
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
            <div className="ai-composer-shell landing-composer" data-testid="landing-composer-shell">
                <section
                    className="landing-step ai-prompt-field relative"
                    data-testid="landing-step-ask"
                    id="landing-step-ask"
                >
                    <p className="sr-only landing-step-kicker">Ask</p>
                    {!filled ? (
                        <div className="ai-prompt-placeholder" data-testid="landing-examples" aria-hidden>
                            <span key={idea.id} className="ai-prompt-placeholder-fade">
                                {idea.text}
                            </span>
                        </div>
                    ) : null}
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
                                if (looksLikeEmail(assignee)) sendIt();
                                else focusEmail();
                            }
                        }}
                        rows={1}
                        className="min-h-[44px] max-h-[40dvh] sm:max-h-[220px] w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-base sm:text-sm leading-relaxed shadow-none rounded-none outline-none caret-teal-300 selection:bg-teal-400/30"
                        placeholder=""
                        data-testid="landing-tryit-input"
                        aria-label="What needs to get done"
                    />
                    {filled ? (
                        <ColorCodedPrompt
                            text={value}
                            className="sr-only"
                            testId="landing-tryit-colorized"
                        />
                    ) : null}
                </section>

                {preview ? (
                    <p className="landing-confirm landing-prompt-readback" data-testid="landing-tryit-result">
                        <span className="landing-confirm-chip">{whoLabel}</span>
                        {' · '}
                        <span className="landing-confirm-title">{preview.title}</span>
                        {preview.when && preview.when !== 'When you set a time' ? (
                            <>
                                {' · '}
                                <span className="landing-confirm-when">{preview.when}</span>
                            </>
                        ) : null}
                    </p>
                ) : (
                    <div data-testid="landing-tryit-result" className="sr-only">
                        <p data-testid="landing-no-account">No account. No password.</p>
                        <p className="landing-send-visual" data-testid="landing-send-promise">
                            We send it. If they go quiet, we follow up.
                        </p>
                    </div>
                )}
                {preview ? (
                    <>
                        <p className="sr-only" data-testid="landing-no-account">No account. No password.</p>
                        <p className="sr-only landing-send-visual" data-testid="landing-send-promise">
                            We send it. If they go quiet, we follow up.
                        </p>
                    </>
                ) : null}

                <div className={`landing-prompt-tools${whoNeeded ? ' is-open' : ''}`}>
                    <section
                        className={`landing-who-step${whoNeeded ? ' is-open' : ' sr-only'}`}
                        data-testid="landing-step-who"
                        id="landing-step-who"
                    >
                        <p className="sr-only landing-step-kicker">Who</p>
                        <p className="sr-only" data-testid="landing-who-cue">
                            Your email. To try it.
                        </p>
                        <Input
                            type="email"
                            value={assignee}
                            onChange={(e) => setAssignee(e.target.value)}
                            placeholder="you@company.com"
                            className={`landing-who-input${whoNeeded ? ' is-needed' : ' sr-only'}`}
                            data-testid="landing-assignee-email"
                            id="landing-assignee-email"
                            aria-label="Your email"
                            autoComplete="email"
                            tabIndex={whoNeeded ? 0 : -1}
                        />
                    </section>
                    <div
                        className={`landing-channel-row${whoNeeded ? '' : ' sr-only'}`}
                        data-testid="landing-channel"
                    >
                        <button
                            type="button"
                            onClick={() => setChannel('email')}
                            className={channel === 'email' ? 'is-on' : ''}
                            data-testid="landing-channel-email"
                            aria-label="Email"
                        >
                            <Mail className="w-3.5 h-3.5" /> Email
                        </button>
                        <button
                            type="button"
                            onClick={() => setChannel('slack')}
                            className={channel === 'slack' ? 'is-on' : ''}
                            data-testid="landing-channel-slack"
                            aria-label="Slack"
                        >
                            <MessageSquare className="w-3.5 h-3.5" /> Slack
                        </button>
                    </div>
                    <section className="ml-auto" data-testid="landing-step-send" id="landing-step-send">
                        <p className="sr-only landing-step-kicker">Send</p>
                        <button
                            type="button"
                            onClick={sendIt}
                            disabled={sending}
                            className={`ai-composer-send h-8 w-8 rounded-full inline-flex items-center justify-center transition-colors ${
                                filled || sending ? 'is-ready' : ''
                            }`}
                            aria-label="Send"
                            title="Send"
                            data-testid="landing-send-it"
                        >
                            {sending
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <ArrowUp className="w-4 h-4" strokeWidth={2.25} />}
                            <span className="sr-only">{sending ? 'Sending…' : 'Send'}</span>
                        </button>
                    </section>
                </div>
            </div>
            <p className="landing-final-line landing-prompt-hint">
                One sentence. One person or a 30+ team.
            </p>
        </div>
    );
};

const LandingPage = () => {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const storyRef = useRef(null);
    const reduceMotion = useReducedMotion();
    const [recordingBlob, setRecordingBlob] = useState(null);
    const [ideaIndex, setIdeaIndex] = useState(0);
    const [value, setValue] = useState('');
    const [tab, setTab] = useState('story');

    const tabVariants = reduceMotion
        ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 1, y: 0 } }
        : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 } };
    const tabTransition = reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] };

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
            {tab === 'story' ? <LandingStoryAtmosphere targetRef={storyRef} /> : null}
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
                <AnimatePresence mode="wait" initial={false}>
                    {tab === 'founder' ? (
                        <motion.div key="founder" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={tabTransition}>
                            <LandingFounder />
                        </motion.div>
                    ) : tab === 'unbiassly' ? (
                        <motion.div key="unbiassly" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={tabTransition}>
                            <LandingUnbiassly />
                        </motion.div>
                    ) : (
                        <motion.div key="story" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={tabTransition}>
                            <div ref={storyRef} className="landing-story-track">
                                <LandingPayoff
                                    onTry={() => scrollToId('landing-tryit')}
                                    onHow={() => scrollToId('landing-film')}
                                />
                                <LandingFilm />

                                <section className="landing-final" data-testid="landing-final">
                                    <p className="landing-section-kicker">Start</p>
                                    <h2 className="landing-final-headline" data-testid="landing-final-headline">
                                        Stop being the reminder system.
                                    </h2>
                                    <p className="landing-final-support" data-testid="landing-final-support">
                                        Your team already said yes. TskFlow makes sure the commitment doesn't disappear.
                                    </p>
                                    <ol className="landing-hero-plot landing-final-plot" data-testid="landing-final-plot">
                                        <li><i>1</i><span><b>They said yes</b> in the meeting.</span></li>
                                        <li><i>2</i><span><b>You used to chase</b> them after.</span></li>
                                        <li><i>3</i><span><b>TskFlow chases</b> them now. Try it below.</span></li>
                                    </ol>
                                    <p className="sr-only">Try it. No account. No password.</p>
                                    <LaunchPad
                                        recordingBlob={recordingBlob}
                                        inputRef={inputRef}
                                        ideaIndex={ideaIndex}
                                        value={value}
                                        setValue={setValue}
                                    />
                                </section>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
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
