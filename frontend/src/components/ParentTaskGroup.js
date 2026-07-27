import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Users, Clock, Trash2, ChevronDown, ChevronRight, Trophy, CheckCircle2, Circle } from 'lucide-react';
import { format } from 'date-fns';
import GroupTaskModal from '@/components/GroupTaskModal';

/**
 * Group card:
 *  - Clicking the CARD (not the chevron/expand area) opens the leaderboard MODAL.
 *  - Clicking the chevron expands INLINE with live-sorted subtasks: pending on top, completed at bottom.
 */
const statusRank = (s) => {
    if (s === 'Pending') return 0;
    if (s === 'Accepted' || s === 'In Progress') return 1;
    if (s === 'Review Pending') return 2;
    if (s === 'Completed') return 3;
    return 1;
};

export const ParentTaskGroup = ({ group, onChanged }) => {
    const [open, setOpen] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [subs, setSubs] = useState([]);
    const [deleting, setDeleting] = useState(false);

    // Fetch subtasks when expanded (and refresh every 8s while open to see live moves)
    useEffect(() => {
        let interval;
        const fetchSubs = async () => {
            try {
                const res = await axios.get(`${API}/tasks/parents/${group.id}/subtasks`);
                setSubs(Array.isArray(res.data) ? res.data : (res.data?.subtasks || []));
            } catch { /* silent */ }
        };
        if (open) {
            fetchSubs();
            interval = setInterval(fetchSubs, 8000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [open, group.id]);

    // Live-sort: pending on top, completed at bottom
    const sortedSubs = useMemo(() => {
        return [...subs].sort((a, b) => {
            const ra = statusRank(a.status), rb = statusRank(b.status);
            if (ra !== rb) return ra - rb;
            // Within same rank, earliest due first
            return (a.due_date || '').localeCompare(b.due_date || '');
        });
    }, [subs]);

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete group "${group.title}" and its ${group.total} sub-tasks?`)) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/tasks/${group.id}`);
            toast.success('Group deleted');
            if (onChanged) onChanged();
        } catch { toast.error('Failed to delete group'); }
        finally { setDeleting(false); }
    };

    const complete = group.percent === 100;

    return (
        <>
            <Card className="border-2 rounded-2xl overflow-hidden hover:shadow-md transition-shadow" data-testid={`parent-group-card-${group.id}`}>
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 cursor-pointer" onClick={() => setModalOpen(true)}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                                <h3 className="font-semibold text-base truncate">{group.title}</h3>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                <span>{group.completed}/{group.total} done</span>
                                <span>·</span>
                                <Clock className="w-3 h-3" />
                                {group.due_date && !isNaN(new Date(group.due_date).getTime())
                                    ? format(new Date(group.due_date), 'MMM dd')
                                    : 'No date'}
                                <span>·</span>
                                <Trophy className="w-3 h-3 text-amber-500" />
                                <span className="text-amber-700">Tap for leaderboard</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <Badge className={complete ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}>{group.percent}%</Badge>
                            <button type="button" onClick={handleDelete} disabled={deleting}
                                className="p-1.5 rounded-full text-red-500 hover:bg-red-50 disabled:opacity-50" title="Delete group"
                                data-testid={`delete-parent-group-${group.id}`}>
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
                                className="p-1.5 rounded-full text-gray-600 hover:bg-white/60" title={open ? 'Collapse' : 'Expand'}
                                data-testid={`toggle-parent-group-${group.id}`}>
                                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="mt-3"><Progress value={group.percent} className="h-2" /></div>
                </div>

                {open && (
                    <div className="border-t bg-white">
                        {sortedSubs.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground">Loading assignees...</div>
                        ) : (
                            <ul className="divide-y">
                                {sortedSubs.map((t) => (
                                    <li key={t.id} className={`flex items-center gap-3 px-4 py-2.5 transition-all ${t.status === 'Completed' ? 'opacity-60' : ''}`}>
                                        {t.status === 'Completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-gray-400 shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{t.assigned_to_name || t.assigned_to_email || 'Unknown'}</div>
                                            <div className="text-xs text-muted-foreground truncate">{t.status}{t.completed_at ? ` • ${format(new Date(t.completed_at), 'MMM d, h:mm a')}` : ''}</div>
                                        </div>
                                        <Badge variant="outline" className={t.status === 'Completed' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : ''}>{t.status}</Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </Card>

            <GroupTaskModal open={modalOpen} onOpenChange={setModalOpen} group={group} />
        </>
    );
};

export default ParentTaskGroup;
