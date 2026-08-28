import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Users } from 'lucide-react';

const TeamClaimsInbox = ({ compact = false }) => {
    const { user } = useAuth();
    const [claims, setClaims] = useState([]);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        if (!user || user.subscription_tier !== 'teams') return;
        try {
            const res = await axios.get(`${API}/team/claims`, { params: { inbox: true } });
            setClaims(Array.isArray(res.data?.claims) ? res.data.claims : []);
        } catch {
            setClaims([]);
        }
    }, [user]);

    useEffect(() => {
        load();
        const onNotif = () => load();
        window.addEventListener('tskflow:notification', onNotif);
        return () => window.removeEventListener('tskflow:notification', onNotif);
    }, [load]);

    const respond = async (claimId, action) => {
        setBusyId(claimId);
        try {
            await axios.post(`${API}/team/claims/${claimId}/respond`, { action });
            toast.success(action === 'accept' ? 'Thanks' : 'Got it');
            setClaims((prev) => prev.filter((c) => c.id !== claimId));
            window.dispatchEvent(new CustomEvent('tskflow:notification'));
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Could not respond');
        } finally {
            setBusyId(null);
        }
    };

    if (!user || user.subscription_tier !== 'teams' || !claims.length) return null;

    return (
        <div
            className={`rounded-2xl border border-amber-200 bg-amber-50/80 ${compact ? 'p-3' : 'p-4'} space-y-3`}
            data-testid="team-claims-inbox"
        >
            <div className="flex items-center gap-2 text-amber-950">
                <Users className="w-4 h-4" />
                <p className="text-sm font-semibold" style={{ fontFamily: 'Outfit' }}>
                    Team requests ({claims.length})
                </p>
            </div>
            {claims.map((c) => (
                <div key={c.id} className="rounded-xl bg-white border border-amber-100 p-3 space-y-2">
                    <p className="text-sm text-slate-800">
                        <span className="font-semibold">{c.claimer_name}</span>
                        {' '}listed you as their manager.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            className="rounded-full h-8"
                            disabled={busyId === c.id}
                            onClick={() => respond(c.id, 'accept')}
                            data-testid={`claim-accept-${c.id}`}
                        >
                            Yes
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full h-8"
                            disabled={busyId === c.id}
                            onClick={() => respond(c.id, 'ignore')}
                            data-testid={`claim-ignore-${c.id}`}
                        >
                            No
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default TeamClaimsInbox;
