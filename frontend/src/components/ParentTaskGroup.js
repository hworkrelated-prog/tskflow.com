import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Users, Bell, CheckCircle2, Clock, Trash2, ChevronRight, BarChart3, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export const ParentTaskGroup = ({ group, onChanged }) => {
    const [open, setOpen] = useState(false);
    const [reminding, setReminding] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [analytics, setAnalytics] = useState(null);
    const [leaderboard, setLeaderboard] = useState(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
    const navigate = useNavigate();

    const handleRemind = async (e) => {
        e.stopPropagation();
        setReminding(true);
        try {
            const res = await axios.post(`${API}/tasks/parents/${group.id}/remind`);
            toast.success(res.data.message || 'Reminders sent');
        } catch (err) {
            toast.error('Failed to send reminders');
        } finally {
            setReminding(false);
        }
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!window.confirm(`Delete group "${group.title}" and its ${group.total} sub-tasks?`)) return;
        setDeleting(true);
        try {
            await axios.delete(`${API}/tasks/${group.id}`);
            toast.success('Group deleted');
            if (onChanged) onChanged();
        } catch (err) {
            toast.error('Failed to delete group');
        } finally {
            setDeleting(false);
        }
    };

    const openAssignee = (e, taskId) => {
        e.stopPropagation();
        navigate(`/task/${taskId}`);
    };

    const fetchAnalytics = async () => {
        if (analytics) {
            setShowAnalytics(!showAnalytics);
            return;
        }
        setLoadingAnalytics(true);
        try {
            const response = await axios.get(`${API}/tasks/${group.id}/analytics`);
            setAnalytics(response.data);
            setShowAnalytics(true);
        } catch (error) {
            toast.error('Failed to load analytics');
        } finally {
            setLoadingAnalytics(false);
        }
    };

    const fetchLeaderboard = async () => {
        if (leaderboard) {
            setShowLeaderboard(!showLeaderboard);
            return;
        }
        setLoadingLeaderboard(true);
        try {
            const response = await axios.get(`${API}/tasks/${group.id}/leaderboard`);
            setLeaderboard(response.data);
            setShowLeaderboard(true);
        } catch (error) {
            toast.error('Failed to load leaderboard');
        } finally {
            setLoadingLeaderboard(false);
        }
    };

    const complete = group.percent === 100;

    return (
        <Card className="border-2 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50">
                <div className="flex items-start justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setOpen(!open)}
                        className="flex-1 text-left min-w-0"
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                            <h3 className="font-semibold text-base truncate">{group.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>{group.completed}/{group.total} done</span>
                            <span>·</span>
                            <Clock className="w-3 h-3" />
                            {group.due_date && !isNaN(new Date(group.due_date).getTime()) ? format(new Date(group.due_date), 'MMM dd') : 'No date'}
                        </p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                        <Badge className={complete ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}>{group.percent}%</Badge>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting}
                            className="p-1.5 rounded-full text-red-500 hover:bg-red-50 disabled:opacity-50"
                            title="Delete group"
                            data-testid={`delete-parent-group-${group.id}`}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(!open)}
                            className="p-1.5 rounded-full text-muted-foreground hover:bg-slate-100"
                            aria-label={open ? 'Collapse' : 'Expand'}
                        >
                            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <div className="mt-3">
                    <Progress value={group.percent} className="h-2" />
                </div>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <CardContent className="pt-0 pb-4 space-y-3">
                            {/* Action buttons */}
                            <div className="flex gap-2 flex-wrap pt-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={fetchAnalytics}
                                    disabled={loadingAnalytics}
                                    className="rounded-full"
                                >
                                    <BarChart3 className="w-3.5 h-3.5 mr-2" />
                                    {loadingAnalytics ? 'Loading...' : showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={fetchLeaderboard}
                                    disabled={loadingLeaderboard}
                                    className="rounded-full"
                                >
                                    <Trophy className="w-3.5 h-3.5 mr-2" />
                                    {loadingLeaderboard ? 'Loading...' : showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard'}
                                </Button>
                            </div>

                            {/* Analytics section */}
                            {showAnalytics && analytics && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                                    <h4 className="font-semibold text-sm text-blue-900">📊 Group Analytics</h4>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <p className="text-blue-700">Completion Rate:</p>
                                            <p className="font-semibold text-blue-900">{analytics.completion_rate}%</p>
                                        </div>
                                        <div>
                                            <p className="text-blue-700">Avg Completion:</p>
                                            <p className="font-semibold text-blue-900">{analytics.avg_completion_hours}h</p>
                                        </div>
                                        <div>
                                            <p className="text-blue-700">Pending:</p>
                                            <p className="font-semibold text-blue-900">{analytics.pending}</p>
                                        </div>
                                        <div>
                                            <p className="text-blue-700">Review Pending:</p>
                                            <p className="font-semibold text-blue-900">{analytics.review_pending}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Leaderboard section */}
                            {showLeaderboard && leaderboard && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-semibold text-sm text-amber-900">🏆 Leaderboard</h4>
                                        <p className="text-xs text-amber-700">{leaderboard.visibility_message}</p>
                                    </div>
                                    <div className="space-y-1">
                                        {leaderboard.leaderboard.slice(0, 5).map((entry) => (
                                            <div key={entry.task_id} className="flex items-center justify-between bg-white rounded p-2 text-xs">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0">
                                                        {entry.rank}
                                                    </Badge>
                                                    <span className="font-medium">{entry.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {entry.completion_hours && (
                                                        <span className="text-green-600">{entry.completion_hours}h</span>
                                                    )}
                                                    <Badge variant={entry.status === 'Completed' ? 'default' : 'outline'} className="text-xs">
                                                        {entry.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Assignees list */}
                            <p className="text-xs text-muted-foreground -mt-1 mb-1">Click a person to open their task details</p>
                            {group.assignees.map((a) => (
                                <button
                                    key={a.task_id}
                                    type="button"
                                    onClick={(e) => openAssignee(e, a.task_id)}
                                    className="w-full flex items-center justify-between gap-2 text-sm p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 transition-colors text-left"
                                    data-testid={`parent-group-assignee-${a.task_id}`}
                                >
                                    <span className="truncate flex-1">{a.name}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {a.completed ? (
                                            <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Done</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">{a.status}</Badge>
                                        )}
                                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                </button>
                            ))}
                            {group.outstanding > 0 && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleRemind}
                                    disabled={reminding}
                                    className="w-full rounded-full mt-1"
                                    data-testid={`remind-group-${group.id}`}
                                >
                                    <Bell className="w-3.5 h-3.5 mr-2" />
                                    {reminding ? 'Sending...' : `Remind ${group.outstanding} outstanding`}
                                </Button>
                            )}
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
};

export default ParentTaskGroup;
