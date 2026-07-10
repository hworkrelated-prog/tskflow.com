import React, { useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Users, Bell, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export const ParentTaskGroup = ({ group, onChanged }) => {
    const [open, setOpen] = useState(false);
    const [reminding, setReminding] = useState(false);

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

    const complete = group.percent === 100;

    return (
        <Card data-testid={`parent-group-${group.id}`} className="rounded-xl border-2 border-indigo-100 overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full text-left p-4 hover:bg-indigo-50/40 transition-colors"
                data-testid={`parent-group-toggle-${group.id}`}
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
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
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge className={complete ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}>{group.percent}%</Badge>
                        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                </div>
                <div className="mt-3">
                    <Progress value={group.percent} className="h-2" />
                </div>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <CardContent className="pt-0 pb-4 space-y-2">
                            {group.assignees.map((a) => (
                                <div key={a.task_id} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg bg-slate-50">
                                    <span className="truncate">{a.name}</span>
                                    {a.completed ? (
                                        <Badge className="bg-green-100 text-green-700 shrink-0"><CheckCircle2 className="w-3 h-3 mr-1" />Done</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 shrink-0">{a.status}</Badge>
                                    )}
                                </div>
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
