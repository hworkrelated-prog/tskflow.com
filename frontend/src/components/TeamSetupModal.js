import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users, GitBranch, UserCheck } from 'lucide-react';
import TeamPeoplePicker from '@/components/TeamPeoplePicker';

const FREQUENCIES = [
    { value: 'weekly', label: 'Weekly', help: 'Teams reshuffle often' },
    { value: 'monthly', label: 'Monthly', help: 'Typical cadence' },
    { value: 'quarterly', label: 'Quarterly', help: 'Mostly stable' },
    { value: 'rarely', label: 'Rarely', help: 'Org chart almost never changes' },
];

/**
 * Teams onboarding: who you report to + who is on your team (with consent claims).
 */
const TeamSetupModal = () => {
    const { user, refreshUser } = useAuth();
    const [open, setOpen] = useState(false);
    const [potential, setPotential] = useState([]);
    const [managerId, setManagerId] = useState('');
    const [teamIds, setTeamIds] = useState([]);
    const [teamEmails, setTeamEmails] = useState([]);
    const [frequency, setFrequency] = useState('monthly');
    const [saving, setSaving] = useState(false);
    const [step, setStep] = useState(1);

    useEffect(() => {
        if (!user) return;
        if (user.subscription_tier !== 'teams') return;

        let cancelled = false;
        (async () => {
            try {
                const prefsRes = await axios.get(`${API}/auth/preferences`).catch(() => ({ data: {} }));
                if (cancelled) return;
                const prefs = prefsRes.data || user.preferences || {};
                if (prefs.team_setup_complete) return;
                if (prefs.hierarchy_review_frequency) setFrequency(prefs.hierarchy_review_frequency);

                const [mgrRes, potRes] = await Promise.all([
                    axios.get(`${API}/team/my-manager`).catch(() => ({ data: null })),
                    axios.get(`${API}/team/potential-reports`).catch(() => ({ data: [] })),
                ]);
                if (cancelled) return;
                const list = Array.isArray(potRes.data) ? potRes.data : [];
                setPotential(list);
                const mgr = mgrRes.data?.manager || mgrRes.data;
                if (mgr?.id) setManagerId(mgr.id);
                setTeamIds(list.filter((p) => p.reports_to_you).map((p) => p.id));
                setOpen(true);
            } catch (_) {
                if (!cancelled) setOpen(true);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    const finish = async ({ skip = false } = {}) => {
        setSaving(true);
        try {
            if (!skip) {
                if (managerId && managerId !== 'none') {
                    await axios.post(`${API}/team/set-manager`, { manager_id: managerId });
                } else if (managerId === 'none') {
                    await axios.post(`${API}/team/set-manager`, { manager_id: null }).catch(() => {});
                }
                if (teamIds.length || teamEmails.length) {
                    const res = await axios.post(`${API}/team/propose-reports`, {
                        user_ids: teamIds,
                        emails: teamEmails,
                    });
                    const n = (res.data?.created || []).length;
                    if (n) toast.success(`Sent ${n} team request${n === 1 ? '' : 's'} — they’ll confirm or dispute`);
                }
            }
            await axios.put(`${API}/auth/preferences`, {
                team_setup_complete: true,
                hierarchy_review_frequency: frequency,
            });
            await refreshUser?.();
            setOpen(false);
            if (!skip) toast.success('Team setup saved');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not save team setup');
        } finally {
            setSaving(false);
        }
    };

    if (!user || user.subscription_tier !== 'teams') return null;

    const titles = {
        1: 'Who do you report to?',
        2: 'Who’s on your team?',
        3: 'How often does it change?',
    };
    const icons = {
        1: <UserCheck className="w-5 h-5" />,
        2: <Users className="w-5 h-5" />,
        3: <GitBranch className="w-5 h-5" />,
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) finish({ skip: true }); else setOpen(v); }}>
            <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto" data-testid="team-setup-modal">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl" style={{ fontFamily: 'Outfit' }}>
                        {icons[step]}
                        {titles[step]}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Set your manager, identify your team, and review cadence
                    </DialogDescription>
                </DialogHeader>

                {step === 1 && (
                    <div className="space-y-4 pt-1">
                        <p className="text-sm text-slate-600">
                            Your manager — the person you report to. This keeps “my team” and assignments accurate.
                        </p>
                        <Select value={managerId || 'none'} onValueChange={setManagerId}>
                            <SelectTrigger className="rounded-xl" data-testid="team-setup-manager">
                                <SelectValue placeholder="Select manager" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">I don’t report to anyone</SelectItem>
                                {potential.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}{p.email ? ` · ${p.email}` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" className="rounded-full" onClick={() => finish({ skip: true })} disabled={saving}>
                                Skip
                            </Button>
                            <Button type="button" className="rounded-full" onClick={() => setStep(2)} data-testid="team-setup-next">
                                Continue
                            </Button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 pt-1">
                        <p className="text-sm text-slate-600">
                            People who report to you. We’ll notify them so they can <strong>accept</strong>, <strong>ignore</strong>, or <strong>dispute</strong> if it’s wrong.
                        </p>
                        <TeamPeoplePicker
                            people={potential}
                            selectedIds={teamIds}
                            selectedEmails={teamEmails}
                            excludeIds={[managerId, user.id].filter(Boolean)}
                            onChange={({ userIds, emails }) => {
                                setTeamIds(userIds);
                                setTeamEmails(emails);
                            }}
                        />
                        <div className="flex justify-between gap-2">
                            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(1)}>
                                Back
                            </Button>
                            <Button type="button" className="rounded-full" onClick={() => setStep(3)} data-testid="team-setup-team-next">
                                Continue
                            </Button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4 pt-1">
                        <p className="text-sm text-slate-600">
                            How often should we remind you to confirm your reporting line?
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {FREQUENCIES.map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setFrequency(f.value)}
                                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                                        frequency === f.value
                                            ? 'border-teal-600 bg-teal-50 text-teal-900'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                    data-testid={`team-freq-${f.value}`}
                                >
                                    <span className="text-sm font-medium block">{f.label}</span>
                                    <span className="text-[11px] opacity-70">{f.help}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-between gap-2">
                            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(2)}>
                                Back
                            </Button>
                            <Button
                                type="button"
                                className="rounded-full"
                                onClick={() => finish()}
                                disabled={saving}
                                data-testid="team-setup-finish"
                            >
                                {saving ? 'Saving…' : 'Done'}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default TeamSetupModal;
