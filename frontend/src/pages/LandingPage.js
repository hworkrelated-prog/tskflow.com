import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, MessageSquare } from 'lucide-react';
import { distillLandingPrompt } from '@/lib/demoDistill';
import {
    DEMO_BEATS,
    DEMO_PEOPLE,
    DEMO_PROMPT,
    DEMO_ROLLUP,
    DEMO_SLACK,
    PROMPT_SEGMENT_CLASS,
    colorizeAssignPrompt,
    isLargeTeamPrompt,
} from '@/lib/landingAssignDemo';
import { pinDocumentTheme, restoreDocumentTheme } from '@/lib/theme';

const initials = (name) =>
    String(name || 'U')
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

const ColorCodedPrompt = ({ text, className = '', testId }) => (
    <p className={className} data-testid={testId}>
        {colorizeAssignPrompt(text).map((part, i) => (
            <span key={`${part.kind}-${i}`} className={PROMPT_SEGMENT_CLASS[part.kind] || PROMPT_SEGMENT_CLASS.plain}>
                {part.text}
            </span>
        ))}
    </p>
);

const TryIt = ({ onTry }) => {
    const navigate = useNavigate();
    const [value, setValue] = useState('');
    const [result, setResult] = useState(null);

    const run = (raw) => {
        const text = (raw ?? value).trim();
        if (!text) return;
        const distilled = distillLandingPrompt(text);
        setResult({ raw: text, group: isLargeTeamPrompt(text), ...distilled });
        onTry?.();
    };

    const displayText = value || DEMO_PROMPT;
    const showSamplePlaceholder = !value;

    return (
        <div className="w-full" data-testid="landing-tryit">
            <label className="block text-xs uppercase tracking-[0.18em] text-teal-200/80 mb-3">
                Try it — no account
            </label>
            <div className="rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/15 p-3 sm:p-4 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)]">
                <div className="relative">
                    <ColorCodedPrompt
                        text={displayText}
                        className={`pointer-events-none absolute inset-0 text-base leading-relaxed whitespace-pre-wrap break-words ${showSamplePlaceholder ? 'opacity-90' : ''}`}
                        testId="landing-tryit-colorized"
                    />
                    <textarea
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                run();
                            }
                        }}
                        rows={3}
                        className="relative w-full resize-none bg-transparent text-base leading-relaxed outline-none caret-teal-300 text-transparent selection:bg-teal-400/30"
                        placeholder=""
                        data-testid="landing-tryit-input"
                        aria-label="Try assigning work in plain English"
                    />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                    <button
                        type="button"
                        className="text-xs text-white/45 hover:text-white/80"
                        onClick={() => {
                            setValue(DEMO_PROMPT);
                            run(DEMO_PROMPT);
                        }}
                    >
                        Use a sample
                    </button>
                    <Button
                        type="button"
                        className="rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 h-10 px-5"
                        onClick={() => run()}
                        data-testid="landing-tryit-go"
                    >
                        See the ask
                    </Button>
                </div>
            </div>

            <AnimatePresence>
                {result && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-4 rounded-2xl bg-white text-slate-900 p-4 sm:p-5 shadow-2xl"
                        data-testid="landing-tryit-result"
                    >
                        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">What they receive</p>
                        <p className="text-xl font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>{result.title}</p>
                        <p className="text-slate-700 mt-2 leading-relaxed">{result.ask}</p>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-teal-50 text-teal-900 px-2.5 py-1">{result.who}</span>
                            <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">{result.when}</span>
                            {result.group && (
                                <span className="rounded-full bg-slate-900 text-white px-2.5 py-1">
                                    {DEMO_PEOPLE.length} people
                                </span>
                            )}
                        </div>
                        {result.group && (
                            <div className="mt-5 space-y-4" data-testid="landing-tryit-rollup">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                    {[
                                        ['Received', DEMO_ROLLUP.received],
                                        ['Accepted', DEMO_ROLLUP.accepted],
                                        ['Silent', DEMO_ROLLUP.silent],
                                        ['Pinged twice', DEMO_ROLLUP.pingedTwice.length],
                                    ].map(([label, n]) => (
                                        <div key={label} className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3">
                                            <p className="text-lg font-semibold">{n}</p>
                                            <p className="text-[11px] text-slate-500">{label}</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500">
                                    Pinged twice: {DEMO_ROLLUP.pingedTwice.slice(0, 4).join(', ')}…
                                </p>
                                <div className="rounded-xl bg-[#4A154B] text-white p-3" data-testid="landing-tryit-slack">
                                    <p className="text-[11px] uppercase tracking-wide text-white/60 mb-2 flex items-center gap-1.5">
                                        <MessageSquare className="w-3.5 h-3.5" /> Slack thread with {DEMO_SLACK.person}
                                    </p>
                                    <p className="text-sm text-white/90 leading-relaxed">{DEMO_SLACK.messages[1].text}</p>
                                    <p className="text-xs text-emerald-300 mt-2">{DEMO_SLACK.result}</p>
                                </div>
                            </div>
                        )}
                        <Button
                            className="mt-5 w-full rounded-full bg-slate-900 hover:bg-slate-800 h-11"
                            onClick={() => navigate('/register')}
                            data-testid="landing-tryit-send"
                        >
                            Send this for real
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const Simulation = () => {
    const [beat, setBeat] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setBeat((b) => (b + 1) % DEMO_BEATS.length), 4800);
        return () => clearInterval(id);
    }, []);

    const cur = DEMO_BEATS[beat];

    return (
        <div className="relative" data-testid="landing-sim">
            <div className="rounded-[1.75rem] bg-gradient-to-b from-white/10 to-white/[0.03] ring-1 ring-inset ring-white/12 p-1">
                <div className="rounded-[1.45rem] bg-[#070b0a] overflow-hidden min-h-[320px] p-6 sm:p-8">
                    <div className="flex gap-2 mb-6">
                        {DEMO_BEATS.map((s, i) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setBeat(i)}
                                className={`h-1 flex-1 rounded-full transition-colors ${i === beat ? 'bg-teal-400' : 'bg-white/15'}`}
                                aria-label={s.label}
                            />
                        ))}
                    </div>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={cur.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.35 }}
                        >
                            {cur.id === 'sentence' && (
                                <>
                                    <p className="text-teal-300/90 text-xs uppercase tracking-[0.2em] mb-3">Instead of another Slack blast</p>
                                    <p className="text-white text-xl sm:text-2xl font-semibold leading-snug mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                        Assign a task to 36 people in one line — and keep the ownership.
                                    </p>
                                    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
                                        <p className="text-[11px] text-white/45 mb-2">You type</p>
                                        <ColorCodedPrompt
                                            text={DEMO_PROMPT.replace(/\.$/, '')}
                                            className="text-sm leading-relaxed"
                                            testId="landing-sim-colorized"
                                        />
                                    </div>
                                </>
                            )}
                            {cur.id === 'assigned' && (
                                <>
                                    <p className="text-teal-300/90 text-xs uppercase tracking-[0.2em] mb-3">Delivered</p>
                                    <p className="text-white text-xl sm:text-2xl font-semibold leading-snug mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                        {DEMO_PEOPLE.length} people received the same ask.
                                    </p>
                                    <div className="flex flex-wrap gap-1.5" data-testid="landing-sim-people">
                                        {DEMO_PEOPLE.slice(0, 18).map((n) => (
                                            <span
                                                key={n}
                                                title={n}
                                                className="w-8 h-8 rounded-full bg-teal-400/20 text-teal-100 text-[10px] font-semibold inline-flex items-center justify-center ring-1 ring-teal-300/20"
                                            >
                                                {initials(n)}
                                            </span>
                                        ))}
                                        <span className="w-8 h-8 rounded-full bg-white/10 text-white/70 text-[10px] inline-flex items-center justify-center">
                                            +{DEMO_PEOPLE.length - 18}
                                        </span>
                                    </div>
                                </>
                            )}
                            {cur.id === 'rollup' && (
                                <>
                                    <p className="text-teal-300/90 text-xs uppercase tracking-[0.2em] mb-3">AI update</p>
                                    <p className="text-white text-xl sm:text-2xl font-semibold leading-snug mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                        Who received it. Who accepted. Who went silent.
                                    </p>
                                    <div className="grid grid-cols-2 gap-2" data-testid="landing-sim-rollup">
                                        {[
                                            ['Received', DEMO_ROLLUP.received, 'Everyone got the ask'],
                                            ['Accepted', DEMO_ROLLUP.accepted, 'Already on it'],
                                            ['Hasn’t responded', DEMO_ROLLUP.silent, 'Still pending'],
                                            ['Pinged twice', DEMO_ROLLUP.pingedTwice.length, DEMO_ROLLUP.pingedTwice.slice(0, 2).join(', ') + '…'],
                                        ].map(([label, n, sub]) => (
                                            <div key={label} className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
                                                <p className="text-2xl font-semibold text-white">{n}</p>
                                                <p className="text-xs text-teal-200 mt-0.5">{label}</p>
                                                <p className="text-[11px] text-white/45 mt-1">{sub}</p>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                            {cur.id === 'slack' && (
                                <>
                                    <p className="text-teal-300/90 text-xs uppercase tracking-[0.2em] mb-3">Still silent after 2 pings</p>
                                    <p className="text-white text-xl sm:text-2xl font-semibold leading-snug mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                        Jarvis opens a Slack thread and talks to them.
                                    </p>
                                    <div className="rounded-xl bg-[#4A154B]/80 ring-1 ring-white/10 p-4 space-y-3" data-testid="landing-sim-slack">
                                        {DEMO_SLACK.messages.map((m, i) => (
                                            <div key={i} className={m.role === 'user' ? 'pl-6' : ''}>
                                                <p className="text-[11px] text-white/50 mb-0.5">{m.name}</p>
                                                <p className="text-sm text-white/90 leading-relaxed">{m.text}</p>
                                            </div>
                                        ))}
                                        <p className="text-xs text-emerald-300 pt-1 flex items-center gap-1.5">
                                            <Check className="w-3.5 h-3.5" /> {DEMO_SLACK.result}
                                        </p>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

const LandingPage = () => {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Marketing page is always brand-dark. Do not follow the app light/dark preference
    // (that preference lives in localStorage and was repainting this page).
    useEffect(() => {
        pinDocumentTheme('dark');
        document.body.classList.add('landing-active');
        return () => {
            document.body.classList.remove('landing-active');
            restoreDocumentTheme();
        };
    }, []);

    const jumpToTry = () => {
        document.getElementById('try')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => {
            document.querySelector('[data-testid="landing-tryit-input"]')?.focus();
        }, 320);
    };

    return (
        <div className="landing-page min-h-screen text-white" style={{ background: '#050807' }} data-testid="landing-page">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-40 right-[-20%] w-[620px] h-[620px] rounded-full bg-teal-500/15 blur-[120px]" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[520px] h-[420px] rounded-full bg-cyan-700/10 blur-[100px]" />
            </div>

            <nav className={`fixed top-0 inset-x-0 z-50 transition-all ${scrolled ? 'bg-[#050807]/85 backdrop-blur-md border-b border-white/5' : ''}`}>
                <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
                    <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>TskFlow</span>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" className="rounded-full text-white/80 hover:text-white hover:bg-white/10 hidden sm:inline-flex" onClick={jumpToTry}>
                            Try a demo
                        </Button>
                        <Button variant="ghost" className="rounded-full text-white/80 hover:text-white hover:bg-white/10" onClick={() => navigate('/login')}>
                            Sign in
                        </Button>
                        <Button className="rounded-full bg-white text-slate-950 hover:bg-teal-100" onClick={() => navigate('/register')}>
                            Get started
                        </Button>
                    </div>
                </div>
            </nav>

            <section className="relative pt-28 pb-10 md:pt-36 md:pb-16">
                <div className="max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
                        <p
                            className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-white mb-6"
                            style={{ fontFamily: 'Outfit, sans-serif' }}
                            data-testid="landing-brand"
                        >
                            TskFlow
                        </p>
                        <h1 className="text-2xl sm:text-3xl lg:text-[2.15rem] font-semibold leading-[1.15] mb-5 text-white/95" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            Still hunting for the work you already assigned?
                        </h1>
                        <p className="text-white/65 text-lg leading-relaxed max-w-md mb-8">
                            Stop chasing work in chat. Every “quick ask” dies the same way — buried, half-owned, and somehow your problem again by Friday.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button size="lg" className="rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 h-12 px-7" onClick={jumpToTry} data-testid="landing-hero-try">
                                Feel the difference
                            </Button>
                            <Button size="lg" variant="outline" className="rounded-full h-12 px-7 border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => navigate('/register')}>
                                Start free
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.1 }}>
                        <Simulation />
                    </motion.div>
                </div>
            </section>

            <section className="relative py-16 md:py-20 border-t border-white/10" data-testid="landing-pain">
                <div className="max-w-3xl mx-auto px-5">
                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true, margin: '-80px' }}
                        className="text-teal-300/90 text-xs uppercase tracking-[0.22em] mb-4"
                    >
                        You&apos;ve lived this
                    </motion.p>
                    <motion.h2
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-80px' }}
                        transition={{ duration: 0.45 }}
                        className="text-3xl sm:text-4xl font-semibold leading-tight mb-10"
                        style={{ fontFamily: 'Outfit, sans-serif' }}
                    >
                        The problem isn&apos;t that people forget. It&apos;s that ownership evaporates the second you hit send.
                    </motion.h2>
                    <div className="space-y-10">
                        {[
                            {
                                sting: '“Just circling back…”',
                                body: 'The follow-up you hate writing — because it means the first ask already failed, and now you\'re the awkward reminder.',
                            },
                            {
                                sting: 'Thread archaeology',
                                body: 'Scrolling a 40-message Slack trail to reconstruct who owns what, who said “on it,” and who went quiet.',
                            },
                            {
                                sting: 'The team-wide ghost',
                                body: 'You asked thirty people. A few replied. Everyone else is a question mark you have to chase yourself — after hours, again.',
                            },
                        ].map((item, i) => (
                            <motion.div
                                key={item.sting}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-60px' }}
                                transition={{ duration: 0.4, delay: i * 0.08 }}
                                className="border-l border-teal-400/35 pl-5"
                            >
                                <h3 className="text-xl font-semibold mb-2 text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>{item.sting}</h3>
                                <p className="text-white/55 leading-relaxed">{item.body}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            <section id="try" className="relative py-16 md:py-24">
                <div className="max-w-3xl mx-auto px-5">
                    <h2 className="text-3xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Type an assignment. Watch it become an ask.</h2>
                    <p className="text-white/55 mb-8">No signup for the preview. Sending for real takes an account so people can accept and you can see the rollup.</p>
                    <TryIt />
                </div>
            </section>

            <section className="relative py-16 border-t border-white/10" data-testid="landing-relief">
                <div className="max-w-5xl mx-auto px-5">
                    <h2 className="text-3xl font-semibold mb-3 max-w-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        What changes when the ask can&apos;t disappear
                    </h2>
                    <p className="text-white/55 mb-10 max-w-xl leading-relaxed">
                        You assign it. They accept it. You see who actually did it — without becoming the human reminder system.
                    </p>
                    <div className="grid md:grid-cols-3 gap-10 md:gap-8">
                        {[
                            { t: 'Work you assign does not disappear', d: 'Every ask gets an owner and a time. If they do not accept, you see it — you do not hunt through chat.' },
                            { t: 'They get a direct instruction', d: 'You can talk like a manager. They receive a clear “please do this by Monday,” not a pasted command.' },
                            { t: 'Follow-up is automatic', d: 'Two ignored pings, and Jarvis opens a Slack thread. They reply like a person. The task updates from whatever they say.' },
                        ].map((item) => (
                            <div key={item.t}>
                                <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{item.t}</h3>
                                <p className="text-sm text-white/55 leading-relaxed">{item.d}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section id="pricing" className="relative py-20 border-t border-white/10">
                <div className="max-w-5xl mx-auto px-5">
                    <h2 className="text-3xl font-semibold text-center mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>Simple pricing</h2>
                    <p className="text-center text-white/50 mb-10 text-sm">Start free. Upgrade when you need reminders, recordings, or a company workspace.</p>
                    <div className="grid md:grid-cols-3 gap-5">
                        {[
                            { name: 'Free', price: '$0', period: '/mo', blurb: 'Personal accountability', features: ['Unlimited tasks', 'Email assignment', 'Basic analytics'] },
                            { name: 'Pro', price: '$9', period: '/mo', blurb: 'Close more loops', highlight: true, features: ['Everything in Free', 'Smart reminders', 'EOD summaries', 'Attachments & recordings'] },
                            { name: 'Teams', price: '$12', period: '/user/mo', blurb: 'Company workspace', features: ['Everything in Pro', 'Hierarchy & leaderboards', 'Slack follow-up for ignored tasks', 'Team analytics'] },
                        ].map((plan) => (
                            <div
                                key={plan.name}
                                className={`rounded-2xl p-6 flex flex-col ${plan.highlight ? 'bg-teal-400 text-slate-950 shadow-xl' : 'bg-white/[0.04] ring-1 ring-inset ring-white/10'}`}
                            >
                                <p className="text-sm font-medium opacity-70">{plan.name}</p>
                                <p className="text-3xl font-bold mt-2 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {plan.price}<span className="text-base font-normal opacity-60">{plan.period}</span>
                                </p>
                                <p className={`text-sm mb-5 ${plan.highlight ? 'text-slate-800' : 'text-white/55'}`}>{plan.blurb}</p>
                                <ul className={`text-sm space-y-2 mb-6 flex-1 ${plan.highlight ? 'text-slate-800' : 'text-white/75'}`}>
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2">
                                            <span>✓</span>
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    className={`w-full rounded-full ${plan.highlight ? 'bg-slate-950 hover:bg-slate-800 text-white' : 'bg-white text-slate-950 hover:bg-teal-100'}`}
                                    onClick={() => navigate('/register')}
                                >
                                    Get started
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <footer className="relative border-t border-white/10 py-10">
                <div className="max-w-6xl mx-auto px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm text-white/45">
                    <span>
                        <span className="font-semibold text-white/70" style={{ fontFamily: 'Outfit, sans-serif' }}>TskFlow</span>
                        {' '}is a trade name of Unbiassly, Inc.
                    </span>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <Link to="/contact" className="hover:text-white">Contact</Link>
                        <Link to="/legal" className="hover:text-white">Legal</Link>
                        <Link to="/privacy" className="hover:text-white">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-white">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
