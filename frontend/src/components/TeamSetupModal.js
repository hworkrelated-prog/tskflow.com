import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users, GitBranch } from 'lucide-react';

const FREQUENCIES = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'rarely', label: 'Rarely / stable' },
];

/**
 * Shown after sign-in until the user sets their reporting line + change cadence.
 */
const TeamSetupModal = () => {
    const { user, refreshUser } = useAuth();
    const [open, setOpen] = useState(false);
    const [potential, setPotential] = useState([]);
    const [managerId, setManagerId] = useState('');
    const [frequency, setFrequency] = useState('monthly');
    const [saving, setSaving] = useState(false);
    const [step, setStep] = useState(1);

    useEffect(() => {
        if (!user) return;
        const isTeams = user.subscription_tier === 'teams';
        if (!isTeams) return;

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
                setOpen(true);
            } catch (_) {
                if (!cancelled) setOpen(true);
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    const finish = async ({ skipManager = false } = {}) => {
        setSaving(true);
        try {
            if (!skipManager && managerId && managerId !== 'none') {
                await axios.post(`${API}/team/set-manager`, { manager_id: managerId });
            } else if (skipManager || managerId === 'none') {
                await axios.post(`${API}/team/set-manager`, { manager_id: null }).catch(() => {});
            }
            await axios.put(`${API}/auth/preferences`, {
                team_setup_complete: true,
                hierarchy_review_frequency: frequency,
            });
            await refreshUser?.();
            setOpen(false);
            toast.success('Team setup saved');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not save team setup');
        } finally {
            setSaving(false);
        }
    };

    if (!user || user.subscription_tier !== 'teams') return null;

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) finish({ skipManager: true }); else setOpen(v); }}>
            <DialogContent className="rounded-2xl max-w-md" data-testid="team-setup-modal">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl" style={{ fontFamily: 'Outfit' }}>
                        {step === 1 ? <Users className="w-5 h-5" /> : <GitBranch className="w-5 h-5" />}
                        {step === 1 ? 'Who’s on your team?' : 'How often does it change?'}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Choose your manager and how often your reporting structure changes
                    </DialogDescription>
                </DialogHeader>

                {step === 1 && (
                    <div className="space-y-4 pt-1">
                        <p className="text-sm text-slate-600">
                            Pick who you report to so “my team” and assignments stay accurate.
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
                            <Button
                                type="button"
                                variant="ghost"
                                className="rounded-full"
                                onClick={() => finish({ skipManager: true })}
                                disabled={saving}
                            >
                                Skip
                            </Button>
                            <Button
                                type="button"
                                className="rounded-full"
                                onClick={() => setStep(2)}
                                data-testid="team-setup-next"
                            >
                                Continue
                            </Button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 pt-1">
                        <p className="text-sm text-slate-600">
                            How often do you expect reporting lines or team makeup to change?
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {FREQUENCIES.map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setFrequency(f.value)}
                                    className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                                        frequency === f.value
                                            ? 'border-teal-600 bg-teal-50 text-teal-900'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                    data-testid={`team-freq-${f.value}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-between gap-2">
                            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(1)}>
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
