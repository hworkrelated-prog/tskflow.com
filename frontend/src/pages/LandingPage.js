import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Play } from 'lucide-react';

const DEMO_STEPS = [
    { type: 'type', text: 'Have Jordan send the Q3 deck by Friday — clean slides, no filler' },
    { type: 'assign', title: 'Send Q3 deck', who: 'Jordan Lee', when: 'Fri 5:00 PM', priority: 'High' },
    { type: 'track', accepted: true, done: false, label: 'Accepted · in progress' },
    { type: 'report', line: 'Jordan delivered. Sam still hasn\'t accepted two tasks.' },
];

const InteractiveDemo = () => {
    const [step, setStep] = useState(0);
    const [typed, setTyped] = useState('');

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            while (!cancelled) {
                for (let s = 0; s < DEMO_STEPS.length; s++) {
                    if (cancelled) return;
                    setStep(s);
                    const cur = DEMO_STEPS[s];
                    if (cur.type === 'type') {
                        setTyped('');
                        for (let i = 1; i <= cur.text.length; i++) {
                            if (cancelled) return;
                            setTyped(cur.text.slice(0, i));
                            await new Promise((r) => setTimeout(r, 28));
                        }
                        await new Promise((r) => setTimeout(r, 900));
                    } else {
                        await new Promise((r) => setTimeout(r, 1600));
                    }
                }
            }
        };
        run();
        return () => { cancelled = true; };
    }, []);

    const cur = DEMO_STEPS[step];

    return (
        <div className="relative w-full max-w-xl mx-auto" data-testid="landing-demo">
            <div className="rounded-2xl border border-white/10 bg-[#0f1412]/90 backdrop-blur-md shadow-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    <span className="text-xs text-white/60 tracking-wide">Tell TskFlow</span>
                </div>
                <div className="p-5 min-h-[220px]">
                    <AnimatePresence mode="wait">
                        {cur.type === 'type' && (
                            <motion.p
                                key="type"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-lg text-white/90 font-medium leading-relaxed"
                                style={{ fontFamily: 'Outfit, sans-serif' }}
                            >
                                {typed}
                                <span className="inline-block w-0.5 h-5 bg-teal-400 ml-0.5 animate-pulse align-middle" />
                            </motion.p>
                        )}
                        {cur.type === 'assign' && (
                            <motion.div
                                key="assign"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="space-y-3"
                            >
                                <p className="text-sm text-teal-300/90">Assigned</p>
                                <p className="text-2xl text-white font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>{cur.title}</p>
                                <div className="flex flex-wrap gap-3 text-sm text-white/70">
                                    <span>{cur.who}</span>
                                    <span>·</span>
                                    <span>{cur.when}</span>
                                    <span>·</span>
                                    <span className="text-amber-300">{cur.priority}</span>
                                </div>
                            </motion.div>
                        )}
                        {cur.type === 'track' && (
                            <motion.div
                                key="track"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="space-y-4"
                            >
                                <p className="text-sm text-white/50">Following up</p>
                                <div className="flex items-center gap-3">
                                    <span className="h-2.5 w-2.5 rounded-full bg-teal-400 animate-pulse" />
                                    <p className="text-xl text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>{cur.label}</p>
                                </div>
                            </motion.div>
                        )}
                        {cur.type === 'report' && (
                            <motion.div
                                key="report"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                            >
                                <p className="text-sm text-white/50 mb-2">End of day</p>
                                <p className="text-xl text-white leading-snug" style={{ fontFamily: 'Outfit, sans-serif' }}>{cur.line}</p>
                            </motion.div>
                        )}
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
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="min-h-screen text-slate-900" style={{ background: 'linear-gradient(165deg, #e8f0ec 0%, #f7f4ef 42%, #dfe8e4 100%)' }}>
            {/* Atmosphere */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-32 -right-20 w-[520px] h-[520px] rounded-full bg-teal-600/10 blur-3xl" />
                <div className="absolute bottom-0 left-[-10%] w-[480px] h-[380px] rounded-full bg-amber-700/8 blur-3xl" />
            </div>

            <nav className={`fixed top-0 inset-x-0 z-50 transition-all ${scrolled ? 'bg-[#f7f4ef]/90 backdrop-blur border-b border-slate-900/5' : ''}`}>
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <span className="text-xl font-bold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>TskFlow</span>
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" className="rounded-full" onClick={() => navigate('/login')}>Sign in</Button>
                        <Button className="rounded-full bg-slate-900 hover:bg-slate-800" onClick={() => navigate('/register')}>
                            Get started
                        </Button>
                    </div>
                </div>
            </nav>

            {/* Hero — one composition */}
            <section className="relative pt-28 pb-16 md:pt-36 md:pb-24">
                <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <p className="text-5xl md:text-6xl font-bold tracking-tight mb-6 text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            TskFlow
                        </p>
                        <h1 className="text-2xl md:text-3xl font-semibold text-slate-800 leading-snug mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                            Tell it what needs to get done. It handles the rest — and tells you who&apos;s actually getting it done.
                        </h1>
                        <p className="text-slate-600 mb-8 max-w-md">
                            Plain English in. Assignment, follow-up, and a clear picture of who delivers.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                size="lg"
                                className="rounded-full bg-teal-800 hover:bg-teal-900 h-12 px-7"
                                onClick={() => navigate('/register')}
                            >
                                Start free
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                            <Button
                                size="lg"
                                variant="outline"
                                className="rounded-full h-12 px-7 border-slate-300"
                                onClick={() => navigate('/login')}
                            >
                                <Play className="w-4 h-4 mr-2" />
                                Sign in
                            </Button>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.15 }}
                    >
                        <InteractiveDemo />
                    </motion.div>
                </div>
            </section>

            {/* One job section */}
            <section className="relative py-20 border-t border-slate-900/5">
                <div className="max-w-3xl mx-auto px-6 text-center">
                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-4xl font-bold mb-4"
                        style={{ fontFamily: 'Outfit, sans-serif' }}
                    >
                        An AI manager, not another board
                    </motion.h2>
                    <p className="text-slate-600 text-lg leading-relaxed">
                        You describe the work. TskFlow picks the owner, sets the bar for &ldquo;done well,&rdquo; chases acceptance by priority, and reports who showed up — and who didn&apos;t.
                    </p>
                </div>
            </section>

            {/* Three beats */}
            <section className="relative py-16">
                <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-10">
                    {[
                        { t: 'Say it once', d: 'One text box. Title, who, when, and expectations — parsed for you.' },
                        { t: 'It follows up', d: 'Urgent gets chased hard. Lower priority waits for quieter hours.' },
                        { t: 'You see the truth', d: 'Daily rollup: who accepted, who stalled, who got the most done.' },
                    ].map((item, i) => (
                        <motion.div
                            key={item.t}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <p className="text-sm font-semibold text-teal-800 mb-2">{String(i + 1).padStart(2, '0')}</p>
                            <h3 className="text-xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{item.t}</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">{item.d}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="relative py-20 border-t border-slate-900/5">
                <div className="max-w-5xl mx-auto px-6">
                    <h2 className="text-3xl font-bold text-center mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>Simple pricing</h2>
                    <p className="text-center text-slate-600 mb-10 text-sm">Start free. Upgrade when you need Jarvis, reminders, or a company workspace.</p>
                    <div className="grid md:grid-cols-3 gap-6">
                        {[
                            {
                                name: 'Free',
                                price: '$0',
                                period: '/mo',
                                blurb: 'Personal accountability',
                                features: ['Unlimited tasks', 'Email assignment', 'Basic analytics', 'Jarvis chat (core)'],
                            },
                            {
                                name: 'Pro',
                                price: '$9',
                                period: '/mo',
                                blurb: 'For people who close more loops',
                                highlight: true,
                                features: ['Everything in Free', 'Smart reminders', 'EOD summaries', 'Attachments & recordings', 'Sales task tagging'],
                            },
                            {
                                name: 'Teams',
                                price: '$12',
                                period: '/user/mo',
                                blurb: 'Company workspace + admin controls',
                                features: ['Everything in Pro', 'Domain team workspace', 'Hierarchy & leaderboards', 'Admin Slack webhook', 'Team analytics'],
                            },
                        ].map((plan) => (
                            <div
                                key={plan.name}
                                className={`rounded-2xl p-6 flex flex-col ${plan.highlight ? 'bg-slate-900 text-white shadow-xl ring-2 ring-teal-500/40' : 'bg-white/70 border border-slate-200'}`}
                            >
                                <p className="text-sm font-medium opacity-70">{plan.name}</p>
                                <p className="text-3xl font-bold mt-2 mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {plan.price}<span className="text-base font-normal opacity-60">{plan.period}</span>
                                </p>
                                <p className={`text-sm mb-5 ${plan.highlight ? 'text-white/70' : 'text-slate-600'}`}>{plan.blurb}</p>
                                <ul className={`text-sm space-y-2 mb-6 flex-1 ${plan.highlight ? 'text-white/85' : 'text-slate-700'}`}>
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2">
                                            <span className={`mt-0.5 ${plan.highlight ? 'text-teal-300' : 'text-teal-700'}`}>✓</span>
                                            <span>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    className={`w-full rounded-full ${plan.highlight ? 'bg-teal-500 hover:bg-teal-400 text-slate-900' : 'bg-slate-900 hover:bg-slate-800'}`}
                                    onClick={() => navigate('/register')}
                                >
                                    Get started
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="relative py-16">
                <div className="max-w-3xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        Stop chasing. Start knowing.
                    </h2>
                    <Button size="lg" className="rounded-full bg-teal-800 hover:bg-teal-900 h-12 px-8" onClick={() => navigate('/register')}>
                        Try TskFlow free
                    </Button>
                </div>
            </section>

            <footer className="relative border-t border-slate-900/10 py-10">
                <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm text-slate-600">
                    <span className="font-semibold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>TskFlow</span>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <Link to="/contact" className="hover:text-slate-900">Contact</Link>
                        <Link to="/privacy" className="hover:text-slate-900">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-slate-900">Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
