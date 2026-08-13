import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Search, BookOpen, Sparkles, PlayCircle, MessageSquare, Rocket, Compass, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const topics = [
    {
        id: 'quickstart',
        icon: <Rocket className="w-4 h-4" />, title: 'Quick Start Guide', category: 'Getting Started',
        body: (
            <ol className="list-decimal ml-5 space-y-2 text-sm">
                <li>Sign in and open your dashboard. You’ll see three columns: <strong>Assigned to Me</strong>, <strong>Self-Assigned</strong>, and <strong>Delegated</strong>.</li>
                <li>Click the floating <strong>New Task</strong> button at the bottom-left (available on every page).</li>
                <li>Tell TskFlow what you need done in plain English — e.g. &ldquo;Have Sarah email the Q3 update by tomorrow 3pm.&rdquo;</li>
                <li>Confirm the summary (or answer one clarifying question if something critical is missing), then send.</li>
                <li>Use <strong>Advanced create</strong> only when you need attachments, groups, or recurrence extras.</li>
                <li>Ready for more? Try <strong>Voice Mode</strong> (the mic at bottom-right) — tap and say &ldquo;What’s outstanding?&rdquo;</li>
            </ol>
        )
    },
    {
        id: 'drafts',
        icon: <Sparkles className="w-4 h-4" />, title: 'Drafts — never lose a task in progress', category: 'Core Feature',
        body: (
            <div className="text-sm space-y-2">
                <p>As soon as you start filling in Create Task, TskFlow saves a draft in the background. If you close the modal, refresh, or lose Wi-Fi — nothing is lost.</p>
                <ul className="list-disc ml-5 space-y-1">
                    <li>Resume drafts from the yellow <em>Unfinished Drafts</em> strip on your dashboard.</li>
                    <li>Delete drafts you no longer need with the trash icon.</li>
                    <li>Offline edits sync automatically the moment you’re back online.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'recurring',
        icon: <Compass className="w-4 h-4" />, title: 'Recurring tasks', category: 'Core Feature',
        body: (
            <div className="text-sm space-y-2">
                <p>Turn any task into a series. Frequencies supported: <strong>Daily, Weekdays, Weekly, Every 2 Weeks, Monthly, Yearly, Custom</strong>.</p>
                <p>You control when it ends: never (until you stop it), on a specific date, or after N occurrences. Edit a series with three scopes: <em>This occurrence, This + future, Entire series</em>. Skip an occurrence any time.</p>
            </div>
        )
    },
    {
        id: 'voice',
        icon: <PlayCircle className="w-4 h-4" />, title: 'Voice Mode & Assistant', category: 'AI Assistant',
        body: (
            <div className="text-sm space-y-2">
                <p>Tap the mic (bottom-right) — no popup, it listens immediately. Use it to:</p>
                <ul className="list-disc ml-5">
                    <li>Ask about outstanding tasks or open a page.</li>
                    <li>Create tasks by voice (&ldquo;Create a task to call the vendor Friday at 10&rdquo;).</li>
                    <li>Ask how-to questions (&ldquo;How does the leaderboard rank people?&rdquo;).</li>
                </ul>
                <p>Voice Mode persists across pages. Tip: keyboard shortcut <kbd className="px-1.5 py-0.5 border rounded text-xs">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 border rounded text-xs">Shift</kbd> + <kbd className="px-1.5 py-0.5 border rounded text-xs">M</kbd> toggles it.</p>
            </div>
        )
    },
    {
        id: 'smart-create',
        icon: <Sparkles className="w-4 h-4" />, title: 'Smart Task Creation', category: 'AI Assistant',
        body: (
            <p className="text-sm">Type a natural description or dictate one. TskFlow infers the title, due date, priority, category, action items, and even hints at assignees when they’re explicitly named. You always get final say — every field is editable.</p>
        )
    },
    {
        id: 'group',
        icon: <MessageSquare className="w-4 h-4" />, title: 'Group tasks & leaderboards', category: 'Team',
        body: (
            <p className="text-sm">When you assign a task to more than one person, TskFlow builds a shared parent with one subtask per assignee. Everyone sees a live leaderboard ranking participants by speed and engagement — great motivation to close things out.</p>
        )
    },
    {
        id: 'analytics',
        icon: <BookOpen className="w-4 h-4" />, title: 'Analytics & Team Leaderboard', category: 'Reporting',
        body: (
            <p className="text-sm">Head to /analytics. Two separate views: <strong>Overall Analytics</strong> (completion rate, overdue count, avg completion, avg response, trends, filters) and the <strong>Team Leaderboard</strong> (fastest, highest completion, most completed, streaks, badges).</p>
        )
    },
    {
        id: 'reminders',
        icon: <HelpCircle className="w-4 h-4" />, title: 'Smart Reminders', category: 'Notifications',
        body: (
            <p className="text-sm">Enable Smart Reminders in Settings → Reminders. Start from Essential / Balanced / Assertive, then choose triggers (before due, no response, no progress, overdue), priorities, channels (in-app, email, Slack), timing, quiet hours, and a daily email cap. Defaults stay quiet so nudges help instead of overwhelm.</p>
        )
    },
    {
        id: 'faq',
        icon: <HelpCircle className="w-4 h-4" />, title: 'FAQs', category: 'FAQs',
        body: (
            <div className="text-sm space-y-2">
                <p><strong>Do I need to install anything?</strong> No — TskFlow runs in your browser.</p>
                <p><strong>Can external people receive tasks?</strong> Yes — use their email; we’ll send them an invite link.</p>
                <p><strong>Is my data private?</strong> Your task metrics for direct reports only include tasks you assigned to them.</p>
                <p><strong>Does Voice Mode work in Safari?</strong> Best in Chrome / Edge. Safari support is partial.</p>
            </div>
        )
    },
    {
        id: 'positioning',
        icon: <Rocket className="w-4 h-4" />, title: 'Accountability Management — what is that?', category: 'Getting Started',
        body: (
            <p className="text-sm">TskFlow is not just a to-do app. It’s an accountability platform: every commitment has a clear owner, a due time, an acceptance step, and completion proof. Group tasks, leaderboards, EOD reports, and smart reminders together make follow-through visible and unavoidable.</p>
        )
    },
];

const HelpCenter = () => {
    const { user } = useAuth();
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
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
            <header className="border-b bg-white sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="rounded-full">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit' }}>Help Center</h1>
                            <p className="text-xs text-muted-foreground">Guides, walkthroughs, FAQs — and remember, you can just ask Voice Mode too.</p>
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
                            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs — e.g. drafts, recurring, voice, analytics" className="pl-9 rounded-full" />
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
                            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center col-span-2 py-12">No topics match “{q}”. Try asking Voice Mode instead — it can answer freely.</p>}
                        </div>
                    </>
                )}

                {tab === 'walkthrough' && (
                    <Card className="rounded-2xl">
                        <CardHeader>
                            <CardTitle style={{ fontFamily: 'Outfit' }}>5-minute walkthrough</CardTitle>
                            <CardDescription>Everything you need to start being productive.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {[
                                { step: '1', title: 'Create your first task', body: 'Use the floating New Task button and describe what you need in plain English. Confirm and send.' },
                                { step: '2', title: 'Turn a routine into recurring', body: 'Open Advanced Options in Create Task. Pick a frequency, set an end (or never). TskFlow keeps future occurrences pre-filled.' },
                                { step: '3', title: 'Delegate to your team', body: 'Type an email or search a teammate. Assign to multiple people to create a group task with a live leaderboard.' },
                                { step: '4', title: 'Ask Voice Mode', body: 'Tap the mic bottom-right. Say &ldquo;What’s overdue?&rdquo; or &ldquo;How do drafts work?&rdquo; — it does both.' },
                                { step: '5', title: 'Turn on Smart Reminders', body: 'Settings → Reminders. Set triggers, frequency, and channels so nothing important goes cold.' },
                            ].map((s) => (
                                <div key={s.step} className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold shrink-0">{s.step}</div>
                                    <div>
                                        <h3 className="font-semibold">{s.title}</h3>
                                        <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: s.body }} />
                                    </div>
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
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm">{u.change}</p>
                                    {u.was && <p className="text-xs text-muted-foreground mt-1">Before: {u.was}</p>}
                                </CardContent>
                            </Card>
                        ))}
                        {updates.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">Loading updates…</p>}
                    </div>
                )}

                <div className="mt-10 p-4 rounded-2xl bg-teal-50 border border-teal-100 text-sm text-teal-900 flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-teal-500" />
                    <div>Can’t find what you need? Tap the mic (bottom-right) and just ask Voice Mode — it knows every feature.</div>
                </div>
            </main>
        </div>
    );
};

export default HelpCenter;
