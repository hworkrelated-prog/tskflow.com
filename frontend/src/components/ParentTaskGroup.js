import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Users, Bell, CheckCircle2, Clock, Trash2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export const ParentTaskGroup = ({ group, onChanged }) => {
    const [open, setOpen] = useState(false);
    const [reminding, setReminding] = useState(false);
    const [deleting, setDeleting] = useState(false);
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

    const complete = group.percent === 100;

    return (
        <Card data-testid={`parent-group-${group.id}`} className="rounded-xl border-2 border-indigo-100 overflow-hidden">
            <div className="w-full p-4 hover:bg-indigo-50/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => setOpen(!open)}
                        className="min-w-0 flex-1 text-left"
                        data-testid={`parent-group-toggle-${group.id}`}
                    >
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-indigo-500 shrink-0" />
                            <p className="font-semibold truncate">{group.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
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
                        <CardContent className="pt-0 pb-4 space-y-2">
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
