import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search, BookOpen, Sparkles, PlayCircle, MessageSquare, Rocket, Compass, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const topics = [
    {
        id: 'quickstart',
        icon: <Rocket className="w-4 h-4" />, title: 'Quick start', category: 'Getting Started',
        body: (
            <ol className="list-decimal ml-5 space-y-2 text-sm">
                <li>Type who, what, when. Enter.</li>
                <li>Send. We run after them.</li>
                <li><strong>To me</strong> · <strong>Personal</strong> · <strong>Delegated</strong></li>
                <li><strong>Full form</strong> for extras.</li>
            </ol>
        )
    },
    {
        id: 'drafts',
        icon: <Sparkles className="w-4 h-4" />, title: 'Drafts', category: 'Core Feature',
        body: (
            <p className="text-sm">Drafts in the header.</p>
        )
    },
    {
        id: 'recurring',
        icon: <Compass className="w-4 h-4" />, title: 'Recurring', category: 'Core Feature',
        body: (
            <p className="text-sm">Say how often, or toggle Repeat.</p>
        )
    },
    {
        id: 'voice',
        icon: <PlayCircle className="w-4 h-4" />, title: 'Voice', category: 'AI Assistant',
        body: (
            <p className="text-sm">Tap the mic. <kbd className="px-1.5 py-0.5 border rounded text-xs">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 border rounded text-xs">Shift</kbd> + <kbd className="px-1.5 py-0.5 border rounded text-xs">M</kbd>.</p>
        )
    },
    {
        id: 'smart-create',
        icon: <Sparkles className="w-4 h-4" />, title: 'Smart create', category: 'AI Assistant',
        body: (
            <p className="text-sm">Name, due, and priority are inferred. Edit before send.</p>
        )
    },
    {
        id: 'group',
        icon: <MessageSquare className="w-4 h-4" />, title: 'Group tasks', category: 'Team',
        body: (
            <p className="text-sm">More than one person → one ask each, plus a leaderboard.</p>
        )
    },
    {
        id: 'analytics',
        icon: <BookOpen className="w-4 h-4" />, title: 'Analytics', category: 'Reporting',
        body: (
            <p className="text-sm">Completion, overdue, speed, leaderboard. CSV from Activity.</p>
        )
    },
    {
        id: 'reminders',
        icon: <HelpCircle className="w-4 h-4" />, title: 'Reminders', category: 'Notifications',
        body: (
            <p className="text-sm">Settings → Reminders. Quiet, Balanced, or Assertive.</p>
        )
    },
    {
        id: 'unbiassly',
        icon: <MessageSquare className="w-4 h-4" />, title: 'Unbiassly', category: 'Side Feature',
        body: (
            <p className="text-sm">Create a shareable link. Anyone can write anonymously. You get the summary, trends, and highlights.</p>
        )
    },
    {
        id: 'faq',
        icon: <HelpCircle className="w-4 h-4" />, title: 'FAQs', category: 'FAQs',
        body: (
            <div className="text-sm space-y-2">
                <p><strong>Install?</strong> No. Browser only.</p>
                <p><strong>Ignored?</strong> Two pings, then Jarvis follows up.</p>
                <p><strong>Not on Tskflow?</strong> Assign by email.</p>
                <p><strong>Privacy?</strong> You see work you assigned.</p>
                <p><strong>Safari?</strong> Voice: Chrome or Edge.</p>
            </div>
        )
    },
];

const HelpCenter = () => {
    const navigate = useNavigate();
    const [q, setQ] = useState('');
    const [updates, setUpdates] = useState([]);
    const initialTab = (() => {
        try {
            const t = new URLSearchParams(window.location.search).get('tab');
            if (t === 'whatsnew' || t === 'walkthrough' || t === 'docs') return t;
        } catch { /* noop */ }
        return 'docs';
    })();
    const [tab, setTab] = useState(initialTab);

    useEffect(() => {
        if (tab === 'whatsnew') {
            axios.get(`${API}/product-updates`).then((r) => setUpdates(r.data?.updates || [])).catch(() => {});
        }
    }, [tab]);

    const filtered = useMemo(() => {
        if (!q.trim()) return topics;
        const ql = q.toLowerCase();
        return topics.filter(t => t.title.toLowerCase().includes(ql) || t.category.toLowerCase().includes(ql));
    }, [q]);

    return (
        <div className="page-shell">
            <header className="border-b bg-white sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="rounded-full">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit' }}>Help</h1>
                        </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2">
                        <button className={`px-3 py-1.5 rounded-full text-xs font-medium ${tab === 'docs' ? 'bg-teal-600 text-white' : 'bg-slate-100'}`} onClick={() => setTab('docs')}>Docs</button>
                        <button className={`px-3 py-1.5 rounded-full text-xs font-medium ${tab === 'walkthrough' ? 'bg-teal-600 text-white' : 'bg-slate-100'}`} onClick={() => setTab('walkthrough')}>Walkthrough</button>
                        <button className={`px-3 py-1.5 rounded-full text-xs font-medium ${tab === 'whatsnew' ? 'bg-teal-600 text-white' : 'bg-slate-100'}`} onClick={() => setTab('whatsnew')}>What&rsquo;s New</button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 max-w-4xl">
                {tab === 'docs' && (
                    <>
                        <div className="mb-6 relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-9 rounded-full" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filtered.map((t, i) => (
                                <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                                    <Card className="h-full border-2 hover:shadow-md transition-shadow rounded-2xl">
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center">{t.icon}</div>
                                                <div>
                                                    <CardTitle className="text-base" style={{ fontFamily: 'Outfit' }}>{t.title}</CardTitle>
                                                    <Badge variant="secondary" className="text-[10px] mt-1">{t.category}</Badge>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>{t.body}</CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center col-span-2 py-12">No match for “{q}”.</p>}
                        </div>
                    </>
                )}

                {tab === 'walkthrough' && (
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle style={{ fontFamily: 'Outfit' }}>Start here</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {[
                                { step: '1', title: 'Assign' },
                                { step: '2', title: 'Repeat' },
                                { step: '3', title: 'Team' },
                                { step: '4', title: 'Ask' },
                            ].map((s) => (
                                <div key={s.step} className="flex gap-4 items-center">
                                    <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold shrink-0">{s.step}</div>
                                    <h3 className="font-semibold">{s.title}</h3>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {tab === 'whatsnew' && (
                    <div className="space-y-3">
                        {updates.map((u) => (
                            <Card key={u.id} className="rounded-2xl border">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-teal-500" /> {u.area}
                                    </CardTitle>
                                    {u.was && <p className="text-xs text-muted-foreground mt-1">Before: {u.was}</p>}
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm">{u.change}</p>
                                </CardContent>
                            </Card>
                        ))}
                        {updates.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>}
                    </div>
                )}
            </main>
        </div>
    );
};

export default HelpCenter;
