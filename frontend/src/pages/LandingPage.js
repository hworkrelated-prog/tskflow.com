import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, CircleAlert } from 'lucide-react';
import { distillLandingPrompt } from '@/lib/demoDistill';

const STORY = [
    {
        id: 'chase',
        pain: 'You asked in chat. Nobody accepted. You still do not know.',
        before: '“Can someone get outreach done Monday?”',
        after: 'Silence. Then you chase. Then you chase again.',
    },
    {
        id: 'ask',
        pain: 'They should hear a real ask — not your routing sentence.',
        before: 'Tell my team that on Monday we need to finish outreach training',
        after: 'On Monday, please finish outreach training.',
    },
    {
        id: 'truth',
        pain: 'End of day, you see who showed up — and who did not.',
        before: 'A pile of unread pings.',
        after: 'Maya accepted. Jordan has not. You know in one glance.',
    },
];

const TryIt = ({ onTry }) => {
    const navigate = useNavigate();
    const [value, setValue] = useState('');
    const [result, setResult] = useState(null);

    const run = (raw) => {
        const text = (raw ?? value).trim();
        if (!text) return;
        const distilled = distillLandingPrompt(text);
        setResult({ raw: text, ...distilled });
        onTry?.();
    };

    return (
        <div className="w-full" data-testid="landing-tryit">
            <label className="block text-xs uppercase tracking-[0.18em] text-teal-200/80 mb-3">
                Try it — no account
            </label>
            <div className="rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/15 p-3 sm:p-4 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)]">
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
                    className="w-full resize-none bg-transparent text-white text-base leading-relaxed outline-none placeholder:text-white/35"
                    placeholder="Tell my team to finish outreach training on Monday"
                    data-testid="landing-tryit-input"
                    aria-label="Try assigning work in plain English"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                    <button
                        type="button"
                        className="text-xs text-white/45 hover:text-white/80"
                        onClick={() => {
                            const sample = 'Tell my team to finish outreach training on Monday';
                            setValue(sample);
                            run(sample);
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
                        </div>
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
        const id = setInterval(() => setBeat((b) => (b + 1) % STORY.length), 4200);
        return () => clearInterval(id);
    }, []);

    const cur = STORY[beat];

    return (
        <div className="relative" data-testid="landing-sim">
            <div className="rounded-[1.75rem] bg-gradient-to-b from-white/10 to-white/[0.03] ring-1 ring-inset ring-white/12 p-1">
                <div className="rounded-[1.45rem] bg-[#070b0a] overflow-hidden min-h-[280px] p-6 sm:p-8">
                    <div className="flex gap-2 mb-6">
                        {STORY.map((s, i) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setBeat(i)}
                                className={`h-1 flex-1 rounded-full transition-colors ${i === beat ? 'bg-teal-400' : 'bg-white/15'}`}
                                aria-label={s.pain}
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
                            <p className="text-teal-300/90 text-xs uppercase tracking-[0.2em] mb-3">What breaks</p>
                            <p className="text-white text-xl sm:text-2xl font-semibold leading-snug mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                {cur.pain}
                            </p>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
                                    <p className="text-[11px] text-rose-300/80 mb-2 flex items-center gap-1.5">
                                        <CircleAlert className="w-3.5 h-3.5" /> Without TskFlow
                                    </p>
                                    <p className="text-sm text-white/70 leading-relaxed">{cur.before}</p>
                                </div>
                                <div className="rounded-xl bg-teal-400/10 ring-1 ring-teal-300/20 p-4">
                                    <p className="text-[11px] text-teal-300 mb-2 flex items-center gap-1.5">
                                        <Check className="w-3.5 h-3.5" /> With TskFlow
                                    </p>
                                    <p className="text-sm text-white/90 leading-relaxed">{cur.after}</p>
                                </div>
                            </div>
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

    const jumpToTry = () => {
        document.getElementById('try')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => {
            document.querySelector('[data-testid="landing-tryit-input"]')?.focus();
        }, 320);
    };

    return (
        <div className="min-h-screen text-white" style={{ background: '#050807' }} data-testid="landing-page">
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
                        <p className="text-teal-300/90 text-xs uppercase tracking-[0.22em] mb-4">Stop chasing work in chat</p>
                        <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold leading-[1.08] mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            You assign it. They accept it. You see who actually did it.
                        </h1>
                        <p className="text-white/65 text-lg leading-relaxed max-w-md mb-8">
                            Chat asks vanish. TskFlow turns one sentence into an owner, a due time, a direct ask, and a follow-up you do not have to write.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button size="lg" className="rounded-full bg-teal-400 hover:bg-teal-300 text-slate-950 h-12 px-7" onClick={jumpToTry} data-testid="landing-hero-try">
                                Test it now
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

            <section id="try" className="relative py-16 md:py-24">
                <div className="max-w-3xl mx-auto px-5">
                    <h2 className="text-3xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Type an assignment. Watch it become an ask.</h2>
                    <p className="text-white/55 mb-8">No signup for the preview. Sending for real takes an account so people can accept and you can see the rollup.</p>
                    <TryIt />
                </div>
            </section>

            <section className="relative py-16 border-t border-white/10">
                <div className="max-w-5xl mx-auto px-5 grid md:grid-cols-3 gap-8">
                    {[
                        { t: 'Work you assign does not disappear', d: 'Every ask gets an owner and a time. If they do not accept, you see it — you do not hunt through chat.' },
                        { t: 'They get a direct instruction', d: 'You can talk like a manager. They receive a clear “please do this by Monday,” not a pasted command.' },
                        { t: 'Follow-up is automatic', d: 'Urgent gets chased. Lower priority waits. End of day you know who delivered and who stalled.' },
                    ].map((item) => (
                        <div key={item.t}>
                            <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{item.t}</h3>
                            <p className="text-sm text-white/55 leading-relaxed">{item.d}</p>
                        </div>
                    ))}
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
                            { name: 'Teams', price: '$12', period: '/user/mo', blurb: 'Company workspace', features: ['Everything in Pro', 'Hierarchy & leaderboards', 'Admin Slack webhook', 'Team analytics'] },
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
