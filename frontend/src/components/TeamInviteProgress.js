import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Trophy } from 'lucide-react';

const TeamInviteProgress = ({ compact = false }) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get(`${API}/team/invite-progress`);
                if (!cancelled) setData(res.data);
            } catch (err) {
                if (!cancelled) setError(err?.response?.data?.detail || 'Could not load invite progress');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (error) {
        return <p className="text-sm text-muted-foreground">{error}</p>;
    }
    if (!data) {
        return <p className="text-sm text-muted-foreground">Loading invite progress…</p>;
    }

    const rows = data.rows || [];
    const summary = data.summary || {};

    return (
        <div className={compact ? 'space-y-3' : 'space-y-4'} data-testid="team-invite-progress">
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-teal-50 dark:bg-teal-950/40 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">In</p>
                    <p className="text-xl font-semibold" style={{ fontFamily: 'Outfit' }}>{summary.in || 0}</p>
                </div>
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Waiting</p>
                    <p className="text-xl font-semibold" style={{ fontFamily: 'Outfit' }}>{summary.waiting || 0}</p>
                </div>
                <div className="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Invited</p>
                    <p className="text-xl font-semibold" style={{ fontFamily: 'Outfit' }}>{summary.total || 0}</p>
                </div>
            </div>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Invite someone</p>
            ) : (
                <div className="space-y-2">
                    {rows.map((row) => (
                        <div
                            key={row.email}
                            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                                row.rank === 1 && !row.waiting ? 'border-amber-300 bg-amber-50/80' : 'border-border bg-card'
                            }`}
                            data-testid="invite-progress-row"
                        >
                            <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-semibold shrink-0">
                                {row.waiting ? '–' : row.rank}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{row.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{row.email}</p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-xs font-medium">{row.stage_label}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {row.waiting ? (row.badge || 'Waiting') : (row.pace_label ? row.pace_label : row.badge)}
                                </p>
                            </div>
                            {row.badge === 'Fastest' && <Trophy className="w-4 h-4 text-amber-600 shrink-0" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TeamInviteProgress;
