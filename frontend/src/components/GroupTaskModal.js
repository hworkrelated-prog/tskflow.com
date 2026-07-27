import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users, CheckCircle2, Eye, Send, Clock } from 'lucide-react';

const StatusPill = ({ on, label }) => (
    <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
        {on ? '\u2713' : '\u2013'} <span>{label}</span>
    </div>
);

export const GroupTaskModal = ({ open, onOpenChange, group }) => {
    const [leaderboard, setLeaderboard] = useState([]);
    const [subtasks, setSubtasks] = useState([]);

    useEffect(() => {
        if (!open || !group?.id) return;
        (async () => {
            try {
                const [lb, kids] = await Promise.all([
                    axios.get(`${API}/tasks/${group.id}/leaderboard`).catch(() => ({ data: { leaderboard: [] } })),
                    axios.get(`${API}/tasks/parents/${group.id}/subtasks`).catch(() => ({ data: [] })),
                ]);
                setLeaderboard(lb.data?.leaderboard || []);
                setSubtasks(Array.isArray(kids.data) ? kids.data : (kids.data?.subtasks || []));
            } catch (_) { /* silent */ }
        })();
    }, [open, group?.id]);

    const rows = useMemo(() => {
        // Merge leaderboard entries with subtask data for status columns
        const byId = {};
        (subtasks || []).forEach((t) => { byId[t.assigned_to] = t; });
        const merged = (leaderboard || []).map((lb) => {
            const t = byId[lb.assignee_id || lb.user_id] || {};
            return {
                ...lb,
                task: t,
                viewed: Boolean(t.viewed_at) || ['Accepted', 'In Progress', 'Review Pending', 'Completed'].includes(t.status),
                accepted: ['Accepted', 'In Progress', 'Review Pending', 'Completed'].includes(t.status),
                submitted: ['Review Pending', 'Completed'].includes(t.status),
                completed: t.status === 'Completed',
            };
        });
        merged.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? -1 : 1));
        return merged;
    }, [leaderboard, subtasks]);

    const completed = rows.filter((r) => r.completed).length;
    const total = rows.length || 1;
    const rate = Math.round((completed / total) * 100);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-600" />
                        {group?.title}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                        <div className="text-xs text-indigo-700">Participants</div>
                        <div className="text-2xl font-bold text-indigo-900">{rows.length}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                        <div className="text-xs text-emerald-700">Completed</div>
                        <div className="text-2xl font-bold text-emerald-900">{completed}/{rows.length}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                        <div className="text-xs text-amber-700">Avg completion rate</div>
                        <div className="text-2xl font-bold text-amber-900">{rate}%</div>
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold">Leaderboard \u2014 sorted by Completed first</span>
                </div>
                <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium">#</th>
                                <th className="text-left px-3 py-2 font-medium">Person</th>
                                <th className="text-left px-3 py-2 font-medium"><Eye className="w-3.5 h-3.5 inline -mt-0.5" /> Viewed</th>
                                <th className="text-left px-3 py-2 font-medium">Accepted</th>
                                <th className="text-left px-3 py-2 font-medium"><Send className="w-3.5 h-3.5 inline -mt-0.5" /> Submitted</th>
                                <th className="text-left px-3 py-2 font-medium"><CheckCircle2 className="w-3.5 h-3.5 inline -mt-0.5" /> Completed</th>
                                <th className="text-left px-3 py-2 font-medium"><Clock className="w-3.5 h-3.5 inline -mt-0.5" /> Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={r.task_id || r.user_id || i} className="border-t">
                                    <td className="px-3 py-2 font-mono">{i + 1}</td>
                                    <td className="px-3 py-2 font-medium">{r.name}</td>
                                    <td className="px-3 py-2"><StatusPill on={r.viewed} label="" /></td>
                                    <td className="px-3 py-2"><StatusPill on={r.accepted} label="" /></td>
                                    <td className="px-3 py-2"><StatusPill on={r.submitted} label="" /></td>
                                    <td className="px-3 py-2"><StatusPill on={r.completed} label="" /></td>
                                    <td className="px-3 py-2 text-gray-600">{r.completion_hours ? `${r.completion_hours}h` : '\u2014'}</td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr><td colSpan="7" className="px-3 py-6 text-center text-gray-500">No participants yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default GroupTaskModal;
