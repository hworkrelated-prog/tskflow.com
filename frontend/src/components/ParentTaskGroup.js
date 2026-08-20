import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Users, Clock, ChevronDown, ChevronRight, Mail, Trophy } from 'lucide-react';
import { format } from 'date-fns';

const pendingFirstRank = (s) => {
    if (s === 'Pending') return 0;
    if (s === 'Accepted' || s === 'In Progress') return 1;
    if (s === 'Review Pending') return 2;
    if (s === 'Completed') return 3;
    return 1;
};

/**
 * Compact group card:
 *  - Click title/header → /task/{id}
 *  - Chevron expands inline leaderboard
 *  - Nudge unfinished emails everyone still open
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
        const doneA = a.status === 'Completed';
        const doneB = b.status === 'Completed';
        if (doneA !== doneB) return doneA ? -1 : 1;
        if (doneA && doneB) {
            return (a.completed_at || '').localeCompare(b.completed_at || '');
        }
        const ra = pendingFirstRank(a.status), rb = pendingFirstRank(b.status);
        if (ra !== rb) return ra - rb;
        return (a.due_date || '').localeCompare(b.due_date || '');
    }), [subs]);

    const unfinishedCount = useMemo(() => sorted.filter((s) => s.status !== 'Completed').length, [sorted]);
    const completedCount = useMemo(() => sorted.filter((s) => s.status === 'Completed').length, [sorted]);

    const openTask = (e) => {
        if (e) e.stopPropagation();
        if (selectable) { if (onToggleSelect) onToggleSelect(group.id); return; }
        navigate(`/task/${group.id}`);
    };

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
    const descPreview = (group.description || '').trim();

    return (
        <Card
            className="border-2 rounded-2xl overflow-hidden hover:shadow-md transition-shadow"
            data-testid={`parent-group-card-${group.id}`}
        >
            <div className="p-4 bg-gradient-to-r from-teal-50 to-teal-50">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        {selectable && (
                            <input
                                type="checkbox"
                                checked={selected}
                                onChange={toggleSelect}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 w-4 h-4 shrink-0 accent-teal-600"
                                data-testid={`select-parent-group-${group.id}`}
                            />
                        )}
                        <button
                            type="button"
                            onClick={openTask}
                            className="flex-1 min-w-0 text-left rounded-lg -m-1 p-1 hover:bg-white/50 transition-colors"
                            data-testid={`open-parent-group-${group.id}`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <Users className="w-4 h-4 text-teal-600 shrink-0" />
                                <h3 className="font-semibold text-base truncate">{group.title}</h3>
                                {(group.is_sales_task || (group.children || []).some((c) => c.is_sales_task)) && (
                                    <span
                                        className="sales-badge shrink-0"
                                        data-testid={`sales-badge-${group.id}`}
                                    >
                                        Sales
                                    </span>
                                )}
                            </div>
                            {descPreview ? (
                                <p className="text-xs text-slate-600 line-clamp-2 mb-1">{descPreview}</p>
                            ) : null}
                            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                <span>{group.completed}/{group.total} done</span>
                                <span>·</span>
                                <Clock className="w-3 h-3" />
                                {group.due_date && !isNaN(new Date(group.due_date).getTime())
                                    ? format(new Date(group.due_date), 'MMM dd')
                                    : 'No date'}
                            </p>
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {(() => {
                            if (!group.due_date || complete) return null;
                            const d = new Date(group.due_date);
                            if (isNaN(d.getTime()) || d >= new Date()) return null;
                            return (
                                <span className="overdue-badge" data-testid={`overdue-badge-${group.id}`}>
                                    <span className="overdue-dot" aria-hidden /> Overdue
                                </span>
                            );
                        })()}
                        <Badge className={complete ? 'bg-green-100 text-green-700' : 'bg-teal-100 text-teal-700'}>{group.percent}%</Badge>
                        <button
                            type="button"
                            onClick={toggleOpen}
                            className="p-1.5 rounded-full text-gray-600 hover:bg-white/70 transition-colors"
                            title={open ? 'Hide leaderboard' : 'Show leaderboard'}
                            aria-expanded={open}
                            data-testid={`toggle-parent-group-${group.id}`}
                        >
                            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <div className="mt-3"><Progress value={group.percent} className="h-2" /></div>
                <p className="mt-2 text-[11px] text-teal-800/80">
                    Open the group to have the assistant review every reply in one briefing.
                </p>
            </div>

            {open && (
                <div className="border-t bg-white">
                    <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b bg-gradient-to-r from-amber-50/80 to-orange-50/40">
                        <div className="flex items-center gap-2 min-w-0">
                            <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="text-sm font-semibold text-amber-950">Leaderboard</span>
                            <span className="text-xs text-amber-800/80 truncate">
                                {completedCount}/{sorted.length || group.total} finished
                            </span>
                        </div>
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
                                {reminding ? 'Sending...' : `Nudge ${unfinishedCount}`}
                            </Button>
                        )}
                    </div>
                    {sorted.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">Loading team…</div>
                    ) : (
                        <ul className="divide-y">
                            {sorted.map((t, i) => {
                                const done = t.status === 'Completed';
                                return (
                                    <li
                                        key={t.id}
                                        className={`flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50/50 cursor-pointer ${done ? 'opacity-80' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); navigate(`/task/${t.id}`); }}
                                        data-testid={`parent-group-subtask-${t.id}`}
                                    >
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                            done ? 'bg-emerald-500 text-white'
                                                : i === 0 ? 'bg-amber-400 text-white'
                                                    : 'bg-slate-200 text-slate-700'
                                        }`}>
                                            {done ? '✓' : i + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{t.assigned_to_name || t.assigned_to_email || 'Unknown'}</div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {t.status}
                                                {t.completed_at ? ` · ${format(new Date(t.completed_at), 'MMM d, h:mm a')}` : ''}
                                            </div>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={
                                                t.status === 'Review Pending' ? 'text-amber-700 border-amber-200 bg-amber-50'
                                                    : done ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                                                        : ''
                                            }
                                        >
                                            {t.status}
                                        </Badge>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <button
                        type="button"
                        onClick={openTask}
                        className="w-full py-2.5 text-sm font-medium text-teal-700 hover:bg-teal-50 border-t"
                        data-testid={`view-parent-group-${group.id}`}
                    >
                        Open group task
                    </button>
                </div>
            )}
        </Card>
    );
};

export default ParentTaskGroup;
