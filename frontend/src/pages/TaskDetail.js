import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const TaskDetail = () => {
    const { taskId } = useParams();
    const { user } = useAuth();
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showDeclineDialog, setShowDeclineDialog] = useState(false);
    const [showCounterDialog, setShowCounterDialog] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [counterMessage, setCounterMessage] = useState('');
    const [proposedDate, setProposedDate] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchTask();
    }, [taskId]);

    const fetchTask = async () => {
        try {
            const response = await axios.get(`${API}/tasks/${taskId}`);
            setTask(response.data);
        } catch (error) {
            toast.error('Failed to load task');
            navigate('/dashboard');
        } finally {
            setLoading(false);
        }
    };

    const handleAccept = async () => {
        setActionLoading(true);
        try {
            await axios.put(`${API}/tasks/${taskId}/accept`);
            toast.success('Task accepted!');
            fetchTask();
        } catch (error) {
            toast.error('Failed to accept task');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDecline = async () => {
        if (!declineReason.trim()) {
            toast.error('Please provide a reason');
            return;
        }
        setActionLoading(true);
        try {
            await axios.put(`${API}/tasks/${taskId}/decline`, { reason: declineReason });
            toast.success('Task declined');
            setShowDeclineDialog(false);
            fetchTask();
        } catch (error) {
            toast.error('Failed to decline task');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCounterPropose = async () => {
        if (!proposedDate) {
            toast.error('Please provide a proposed date');
            return;
        }
        setActionLoading(true);
        try {
            await axios.put(`${API}/tasks/${taskId}/counter-propose`, {
                message: counterMessage,
                proposed_due_date: proposedDate
            });
            toast.success('Counter-proposal submitted');
            setShowCounterDialog(false);
            fetchTask();
        } catch (error) {
            toast.error('Failed to submit proposal');
        } finally {
            setActionLoading(false);
        }
    };

    const handleComplete = async () => {
        setActionLoading(true);
        try {
            await axios.put(`${API}/tasks/${taskId}/complete`);
            toast.success('Task completed!');
            fetchTask();
        } catch (error) {
            toast.error('Failed to complete task');
        } finally {
            setActionLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            'Pending': { class: 'status-badge-pending', label: 'Pending' },
            'Accepted': { class: 'status-badge-accepted', label: 'Accepted' },
            'Declined': { class: 'status-badge-declined', label: 'Declined' },
            'Counter-Proposed': { class: 'status-badge-counter', label: 'Counter-Proposed' },
            'Completed': { class: 'status-badge-completed', label: 'Completed' }
        };
        const { class: className, label } = statusMap[status] || { class: '', label: status };
        return (
            <Badge className={`${className} rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide`}>
                {label}
            </Badge>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium">Loading...</div>
            </div>
        );
    }

    return (
        <div data-testid="task-detail-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            <header className="glass-header border-b">
                <div className="container mx-auto px-6 py-4">
                    <Button
                        data-testid="back-button"
                        variant="ghost"
                        onClick={() => navigate('/dashboard')}
                        className="rounded-full"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Hub
                    </Button>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 max-w-4xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <Card className="border-2 shadow-soft rounded-2xl">
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <CardTitle className="text-4xl mb-2" style={{ fontFamily: 'Outfit' }}>{task.title}</CardTitle>
                                    <CardDescription className="text-base">
                                        Created by {task.created_by_name} | Assigned to {task.assigned_to_name}
                                    </CardDescription>
                                </div>
                                {getStatusBadge(task.status)}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">Priority</Label>
                                    <p className="font-semibold text-lg">{task.priority}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Due Date</Label>
                                    <p className="font-semibold text-lg">{format(new Date(task.due_date), 'MMM dd, yyyy h:mm a')}</p>
                                </div>
                                {task.category && (
                                    <div>
                                        <Label className="text-muted-foreground">Category</Label>
                                        <p className="font-semibold text-lg">{task.category}</p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <Label className="text-muted-foreground">Description</Label>
                                <p className="mt-2 text-base leading-relaxed">{task.description}</p>
                            </div>

                            {task.reason_for_decline && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                                    <Label className="text-red-700">Decline Reason</Label>
                                    <p className="mt-1 text-red-900">{task.reason_for_decline}</p>
                                </div>
                            )}

                            {task.counter_proposal_message && (
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                    <Label className="text-blue-700">Counter Proposal</Label>
                                    <p className="mt-1 text-blue-900">{task.counter_proposal_message}</p>
                                    <p className="mt-2 text-sm text-blue-700">
                                        Proposed Date: {format(new Date(task.proposed_due_date), 'MMM dd, yyyy h:mm a')}
                                    </p>
                                </div>
                            )}

                            {user?.id === task.assigned_to && task.status === 'Pending' && (
                                <div className="flex flex-wrap gap-3 pt-4 border-t">
                                    <Button
                                        data-testid="accept-task-button"
                                        onClick={handleAccept}
                                        disabled={actionLoading}
                                        className="rounded-full"
                                    >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Accept Task
                                    </Button>
                                    
                                    <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
                                        <DialogTrigger asChild>
                                            <Button
                                                data-testid="decline-task-button"
                                                variant="destructive"
                                                className="rounded-full"
                                            >
                                                <XCircle className="w-4 h-4 mr-2" />
                                                Decline
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="rounded-2xl">
                                            <DialogHeader>
                                                <DialogTitle>Decline Task</DialogTitle>
                                                <DialogDescription>Please provide a reason</DialogDescription>
                                            </DialogHeader>
                                            <div className="space-y-4 pt-4">
                                                <Textarea
                                                    data-testid="decline-reason-input"
                                                    placeholder="Why are you declining?"
                                                    value={declineReason}
                                                    onChange={(e) => setDeclineReason(e.target.value)}
                                                    rows={4}
                                                    className="rounded-xl"
                                                />
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => setShowDeclineDialog(false)}
                                                        className="rounded-full"
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        data-testid="confirm-decline-button"
                                                        variant="destructive"
                                                        onClick={handleDecline}
                                                        disabled={actionLoading}
                                                        className="rounded-full"
                                                    >
                                                        Confirm Decline
                                                    </Button>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>

                                    <Dialog open={showCounterDialog} onOpenChange={setShowCounterDialog}>
                                        <DialogTrigger asChild>
                                            <Button
                                                data-testid="counter-propose-button"
                                                variant="outline"
                                                className="rounded-full"
                                            >
                                                <Clock className="w-4 h-4 mr-2" />
                                                Counter-Propose
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="rounded-2xl">
                                            <DialogHeader>
                                                <DialogTitle>Propose New Due Date</DialogTitle>
                                                <DialogDescription>Suggest a new timeline</DialogDescription>
                                            </DialogHeader>
                                            <div className="space-y-4 pt-4">
                                                <div>
                                                    <Label>Proposed Due Date</Label>
                                                    <Input
                                                        data-testid="proposed-date-input"
                                                        type="datetime-local"
                                                        value={proposedDate}
                                                        onChange={(e) => setProposedDate(e.target.value)}
                                                        className="mt-2 rounded-xl"
                                                    />
                                                </div>
                                                <div>
                                                    <Label>Message (optional)</Label>
                                                    <Textarea
                                                        data-testid="counter-message-input"
                                                        placeholder="Explain why you need more time"
                                                        value={counterMessage}
                                                        onChange={(e) => setCounterMessage(e.target.value)}
                                                        rows={3}
                                                        className="mt-2 rounded-xl"
                                                    />
                                                </div>
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => setShowCounterDialog(false)}
                                                        className="rounded-full"
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        data-testid="confirm-counter-button"
                                                        onClick={handleCounterPropose}
                                                        disabled={actionLoading}
                                                        className="rounded-full"
                                                    >
                                                        Submit Proposal
                                                    </Button>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            )}

                            {user?.id === task.assigned_to && task.status === 'Accepted' && (
                                <div className="pt-4 border-t">
                                    <Button
                                        data-testid="complete-task-button"
                                        onClick={handleComplete}
                                        disabled={actionLoading}
                                        className="rounded-full"
                                    >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Mark as Complete
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </main>
        </div>
    );
};

export default TaskDetail;