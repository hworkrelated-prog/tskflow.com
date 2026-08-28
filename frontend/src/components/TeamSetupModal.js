import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import TeamPeoplePicker from '@/components/TeamPeoplePicker';
import TeamInviteProgress from '@/components/TeamInviteProgress';
import { useLocation, useNavigate } from 'react-router-dom';

const FREQUENCIES = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'rarely', label: 'Rarely' },
];

/**
 * Teams onboarding: who you report to + who is on your team (with consent claims).
 */
const TeamSetupModal = () => {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const [potential, setPotential] = useState([]);
    const [managerId, setManagerId] = useState('');
    const [teamIds, setTeamIds] = useState([]);
    const [teamEmails, setTeamEmails] = useState([]);
    const [frequency, setFrequency] = useState('monthly');
    const [saving, setSaving] = useState(false);
    const [step, setStep] = useState(1);
    const [reportsSent, setReportsSent] = useState(false);

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

    const sendTeamRequests = async () => {
        if (reportsSent) return;
        if (!teamIds.length && !teamEmails.length) return;
        const res = await axios.post(`${API}/team/propose-reports`, {
            user_ids: teamIds,
            emails: teamEmails,
        });
        const n = (res.data?.created || []).length;
        if (n) toast.success(`Sent ${n} invite${n === 1 ? '' : 's'}`);
        setReportsSent(true);
    };

    const finish = async ({ skip = false, goToJoining = false } = {}) => {
        setSaving(true);
        try {
            if (!skip) {
                if (managerId && managerId !== 'none') {
                    await axios.post(`${API}/team/set-manager`, { manager_id: managerId });
                } else if (managerId === 'none') {
                    await axios.post(`${API}/team/set-manager`, { manager_id: null }).catch(() => {});
                }
                await sendTeamRequests();
            }
            await axios.put(`${API}/auth/preferences`, {
                team_setup_complete: true,
                hierarchy_review_frequency: frequency,
            });
            await refreshUser?.();
            setOpen(false);
            if (!skip) toast.success('Saved');
            if (goToJoining) navigate('/team?joining=1');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not save team setup');
        } finally {
            setSaving(false);
        }
    };

    if (location.pathname.startsWith('/api/auth/google') || location.pathname.startsWith('/oauth/google')) return null;
    if (!user || user.subscription_tier !== 'teams') return null;

    const titles = {
        1: 'Your manager',
        2: 'Your team',
        3: 'How often?',
        4: 'Joining',
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) finish({ skip: true }); else setOpen(v); }}>
            <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto" data-testid="team-setup-modal">
                <DialogHeader>
                    <DialogTitle className="text-2xl tracking-tight" style={{ fontFamily: 'Outfit' }}>
                        {titles[step]}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Team setup
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-1.5 -mt-1 mb-1" aria-hidden="true">
                    {[1, 2, 3, 4].map((n) => (
                        <span
                            key={n}
                            className={`h-1.5 rounded-full transition-all ${n === step ? 'w-6 bg-foreground' : 'w-1.5 bg-muted'}`}
                        />
                    ))}
                </div>

                {step === 1 && (
                    <div className="space-y-4 pt-1">
                        <Select value={managerId || 'none'} onValueChange={setManagerId}>
                            <SelectTrigger className="rounded-xl h-12" data-testid="team-setup-manager">
                                <SelectValue placeholder="Choose…" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nobody</SelectItem>
                                {potential.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}{p.email ? ` · ${p.email}` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" className="rounded-full" onClick={() => finish({ skip: true })} disabled={saving}>
                                Not now
                            </Button>
                            <Button type="button" className="rounded-full min-w-[7.5rem]" onClick={() => setStep(2)} data-testid="team-setup-next">
                                Continue
                            </Button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 pt-1">
                        <TeamPeoplePicker
                            quiet
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
                            <Button type="button" className="rounded-full min-w-[7.5rem]" onClick={async () => {
                                try {
                                    await sendTeamRequests();
                                } catch (err) {
                                    toast.error(err?.response?.data?.detail || 'Could not send invites');
                                    return;
                                }
                                setStep(3);
                            }} data-testid="team-setup-team-next">
                                Continue
                            </Button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                            {FREQUENCIES.map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setFrequency(f.value)}
                                    className={`rounded-xl border px-3 py-3.5 text-left transition-colors ${
                                        frequency === f.value
                                            ? 'border-foreground bg-foreground text-background'
                                            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                                    }`}
                                    data-testid={`team-freq-${f.value}`}
                                >
                                    <span className="text-sm font-medium block">{f.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-between gap-2">
                            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(2)}>
                                Back
                            </Button>
                            <Button
                                type="button"
                                className="rounded-full min-w-[7.5rem]"
                                onClick={() => setStep(4)}
                                data-testid="team-setup-cadence-next"
                            >
                                Continue
                            </Button>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-4 pt-1">
                        <p className="text-xs text-muted-foreground" data-testid="team-setup-joining-hint">
                            Team → Joining
                        </p>
                        <TeamInviteProgress compact />
                        <div className="flex justify-between gap-2">
                            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(3)}>
                                Back
                            </Button>
                            <Button
                                type="button"
                                className="rounded-full min-w-[7.5rem]"
                                onClick={() => finish({ goToJoining: true })}
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
