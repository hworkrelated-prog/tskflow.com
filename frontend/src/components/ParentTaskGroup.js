import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Users, Clock, ArrowUpRight, ChevronDown, ChevronRight, Mail, Circle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

const statusRank = (s) => {
    if (s === 'Pending') return 0;
    if (s === 'Accepted' || s === 'In Progress') return 1;
    if (s === 'Review Pending') return 2;
    if (s === 'Completed') return 3;
    return 1;
};

/**
 * Compact group card:
 *  - Whole card is a click target → /task/{id} (unified detail view)
 *  - Chevron expands an inline list of assignees (pending on top)
 *  - "Nudge unfinished" button emails everyone who hasn't submitted yet
 *  - No trash icon (moved into the task view itself per user request)
 *  - Selection checkbox is bubbled up via `selectable` + onToggleSelect (parent handles it)
 */
export const ParentTaskGroup = ({ group, onChanged, selectable = false, selected = false, onToggleSelect }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [subs, setSubs] = useState([]);
    const [reminding, setReminding] = useState(false);

    useEffect(() => {
        if (!open) return;
        let interval;
        const load = async () => {
            try {
                const res = await axios.get(`${API}/tasks/parents/${group.id}/subtasks`);
                setSubs(Array.isArray(res.data) ? res.data : (res.data?.subtasks || []));
            } catch { /* silent */ }
        };
        load();
        interval = setInterval(load, 8000);
        return () => clearInterval(interval);
    }, [open, group.id]);

    const sorted = useMemo(() => [...subs].sort((a, b) => {
        const ra = statusRank(a.status), rb = statusRank(b.status);
        if (ra !== rb) return ra - rb;
        return (a.due_date || '').localeCompare(b.due_date || '');
    }), [subs]);

    const unfinishedCount = useMemo(() => sorted.filter((s) => s.status !== 'Completed').length, [sorted]);

    const openTask = (e) => {
        if (e) e.stopPropagation();
        // In multi-select mode, clicking the card body toggles selection instead of navigating.
        if (selectable) { if (onToggleSelect) onToggleSelect(group.id); return; }
        navigate(`/task/${group.id}`);
    };
    const gotoTask = (e) => { if (e) e.stopPropagation(); navigate(`/task/${group.id}`); };

    const nudgeUnfinished = async (e) => {
        e.stopPropagation();
        setReminding(true);
        try {
            const res = await axios.post(`${API}/tasks/parents/${group.id}/remind`);
            toast.success(`Reminder sent to ${res.data?.reminded ?? 'unfinished'} teammate(s)`);
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to send reminders');
        } finally { setReminding(false); }
    };

    const toggleSelect = (e) => { e.stopPropagation(); if (onToggleSelect) onToggleSelect(group.id); };
    const toggleOpen = (e) => { e.stopPropagation(); setOpen((v) => !v); };

    const complete = group.percent === 100;

    return (
        <Card
            className="border-2 rounded-2xl overflow-hidden hover:shadow-md transition-shadow"
            data-testid={`parent-group-card-${group.id}`}
        >
            <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 cursor-pointer" onClick={openTask}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        {selectable && (
                            <input
                                type="checkbox"
                                checked={selected}
                                onChange={toggleSelect}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 w-4 h-4 shrink-0 accent-indigo-600"
                                data-testid={`select-parent-group-${group.id}`}
                            />
                        )}
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
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                            if (!group.due_date || complete) return null;
                            const d = new Date(group.due_date);
                            if (isNaN(d.getTime()) || d >= new Date()) return null;
                            return (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded" data-testid={`overdue-badge-${group.id}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Overdue
                                </span>
                            );
                        })()}
                        <Badge className={complete ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}>{group.percent}%</Badge>
                        <Button size="sm" onClick={gotoTask} className="rounded-full h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white" data-testid={`view-parent-group-${group.id}`}>
                            View Task <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                        <button
                            type="button"
                            onClick={toggleOpen}
                            className="p-1.5 rounded-full text-gray-600 hover:bg-white/70 transition-transform"
                            title={open ? 'Collapse assignees' : 'Show assignees'}
                            data-testid={`toggle-parent-group-${group.id}`}
                        >
                            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <div className="mt-3"><Progress value={group.percent} className="h-2" /></div>
            </div>

            {open && (
                <div className="border-t bg-white">
                    <div className="px-4 py-2 flex items-center justify-between gap-3 border-b">
                        <span className="text-xs text-muted-foreground">Pending on top · completed at bottom</span>
                        {unfinishedCount > 0 && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={nudgeUnfinished}
                                disabled={reminding}
                                className="rounded-full h-7 px-3 text-xs"
                                data-testid={`nudge-parent-group-${group.id}`}
                            >
                                <Mail className="w-3.5 h-3.5 mr-1" />
                                {reminding ? 'Sending...' : `Nudge ${unfinishedCount} unfinished`}
                            </Button>
                        )}
                    </div>
                    {sorted.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">Loading assignees...</div>
                    ) : (
                        <ul className="divide-y">
                            {sorted.map((t) => (
                                <li
                                    key={t.id}
                                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/50 cursor-pointer ${t.status === 'Completed' ? 'opacity-70' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); navigate(`/task/${t.id}`); }}
                                    data-testid={`parent-group-subtask-${t.id}`}
                                >
                                    {t.status === 'Completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-gray-400 shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{t.assigned_to_name || t.assigned_to_email || 'Unknown'}</div>
                                        <div className="text-xs text-muted-foreground truncate">{t.status}{t.completed_at ? ` • ${format(new Date(t.completed_at), 'MMM d, h:mm a')}` : ''}</div>
                                    </div>
                                    <Badge variant="outline" className={t.status === 'Review Pending' ? 'text-amber-700 border-amber-200 bg-amber-50' : t.status === 'Completed' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : ''}>{t.status}</Badge>
                                    <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </Card>
    );
};

export default ParentTaskGroup;
