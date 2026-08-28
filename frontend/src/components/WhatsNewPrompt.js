import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

const SEEN_KEY = 'tsk_seen_product_update';
const FEATURE_BATCH_ID = 'ai-prompt-v2-2026-08';

/**
 * Nudge existing users to review Help Center / What's New after major UX changes.
 */
const WhatsNewPrompt = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [highlights, setHighlights] = useState([]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            try {
                // First-run onboarding owns the screen. Do not stack a changelog on top.
                if (!localStorage.getItem('Tskflow_onboarding_dashboard')) return;
                const seenLocal = localStorage.getItem(SEEN_KEY);
                if (seenLocal === FEATURE_BATCH_ID) return;

                const prefs = await axios.get(`${API}/auth/preferences`).catch(() => ({ data: {} }));
                if (cancelled) return;
                if (prefs.data?.last_seen_product_update === FEATURE_BATCH_ID) {
                    localStorage.setItem(SEEN_KEY, FEATURE_BATCH_ID);
                    return;
                }

                const feed = await axios.get(`${API}/product-updates`).catch(() => ({ data: { updates: [] } }));
                if (cancelled) return;
                const updates = feed.data?.updates || [];
                // Prefer the newest AI / recording / team items
                const pick = updates.filter((u) =>
                    /ai|prompt|record|team|group|assign/i.test(`${u.area} ${u.change}`)
                ).slice(0, 4);
                setHighlights(pick.length ? pick : updates.slice(0, 3));
                // Slight delay so it doesn't collide with team setup / catch-up
                setTimeout(() => { if (!cancelled) setOpen(true); }, 1600);
            } catch (_) { /* silent */ }
        })();
        return () => { cancelled = true; };
    }, [user]);

    const dismiss = async (goHelp = false) => {
        setOpen(false);
        try { localStorage.setItem(SEEN_KEY, FEATURE_BATCH_ID); } catch { /* noop */ }
        try {
            await axios.put(`${API}/auth/preferences`, { last_seen_product_update: FEATURE_BATCH_ID });
        } catch { /* noop */ }
        if (goHelp) navigate('/help?tab=whatsnew');
    };

    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(false); }}>
            <DialogContent className="rounded-2xl max-w-md" data-testid="whats-new-prompt">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl" style={{ fontFamily: 'Outfit' }}>
                        <Sparkles className="w-5 h-5 text-teal-700" />
                        What&apos;s new in Tskflow
                    </DialogTitle>
                    <DialogDescription>
                        Quicker prompt, cleaner recordings, smarter assignment.
                    </DialogDescription>
                </DialogHeader>
                <ul className="space-y-2.5 text-sm text-slate-700">
                    {(highlights.length ? highlights : [
                        { area: 'AI Prompt', change: 'Bottom command bar - type, paste a screenshot, or record, then send.' },
                        { area: 'Screen Recording', change: 'Controls stay bottom-left and draggable; capture no longer freezes when you switch tabs.' },
                        { area: 'Teams', change: '“My team” understands direct vs everyone under you.' },
                    ]).map((h, i) => (
                        <li key={h.id || i} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                            <p className="font-medium text-slate-900">{h.area}</p>
                            <p className="text-slate-600 text-xs mt-0.5 leading-relaxed">{h.change}</p>
                        </li>
                    ))}
                </ul>
                <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="ghost" className="rounded-full" onClick={() => dismiss(false)}>
                        Later
                    </Button>
                    <Button type="button" className="rounded-full" data-testid="whats-new-review-btn" onClick={() => dismiss(true)}>
                        Review in Help
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default WhatsNewPrompt;
