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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, XCircle, Clock, Pencil, Save, Trash2, Image, X, AlertCircle, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { getErrorMessage } from '@/lib/utils';

const TaskDetail = () => {
    const { taskId } = useParams();
    const { user } = useAuth();
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showDeclineDialog, setShowDeclineDialog] = useState(false);
    const [showCounterDialog, setShowCounterDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showCompleteDialog, setShowCompleteDialog] = useState(false);
    const [showReviewDialog, setShowReviewDialog] = useState(false);
    const [declineReason, setDeclineReason] = useState('');
    const [counterMessage, setCounterMessage] = useState('');
    const [proposedDate, setProposedDate] = useState('');
    const [completionNote, setCompletionNote] = useState('');
    const [completionImages, setCompletionImages] = useState([]);
    const [reviewFeedback, setReviewFeedback] = useState('');
    const [editForm, setEditForm] = useState({
        title: '',
        description: '',
        due_date: '',
        priority: '',
        category: ''
    });
    const [editLoading, setEditLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchTask();
    }, [taskId]);

    const fetchTask = async () => {
        try {
            const response = await axios.get(`${API}/tasks/${taskId}`);
            setTask(response.data);
            setEditForm({
                title: response.data.title,
                description: response.data.description || '',
                due_date: response.data.due_date ? response.data.due_date.slice(0, 16) : '',
                priority: response.data.priority,
                category: response.data.category || ''
            });
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load task'));
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
            toast.error(getErrorMessage(error, 'Failed to accept task'));
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
            toast.error(getErrorMessage(error, 'Failed to decline task'));
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
            toast.error(getErrorMessage(error, 'Failed to submit proposal'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleComplete = async () => {
        setActionLoading(true);
        try {
            await axios.put(`${API}/tasks/${taskId}/complete`, {
                completion_note: completionNote || null,
                completion_note_images: completionImages.length > 0 ? completionImages : null
            });
            toast.success(task?.assigned_to === task?.created_by ? 'Task completed!' : 'Task submitted for review');
            setShowCompleteDialog(false);
            setCompletionNote('');
            setCompletionImages([]);
            fetchTask();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to complete task'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleReviewAction = async (action) => {
        setActionLoading(true);
        try {
            await axios.put(`${API}/tasks/${taskId}/review`, {
                action,
                feedback: action === 'send_back' ? reviewFeedback : null
            });
            toast.success(action === 'accept' ? 'Task approved!' : 'Task sent back for revision');
            setShowReviewDialog(false);
            setReviewFeedback('');
            fetchTask();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to review task'));
        } finally {
            setActionLoading(false);
        }
    };

    const handleCompletionImageUpload = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    setCompletionImages(prev => [...prev, event.target.result]);
                };
                reader.readAsDataURL(file);
            }
        });
    };

    const handleEditTask = async () => {
        setEditLoading(true);
        try {
            const response = await axios.put(`${API}/tasks/${taskId}`, editForm);
            toast.success('Task updated! Assignee has been notified.');
            setTask(response.data);
            setShowEditDialog(false);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update task'));
        } finally {
            setEditLoading(false);
        }
    };

    const handleDeleteTask = async () => {
        setDeleteLoading(true);
        try {
            await axios.delete(`${API}/tasks/${taskId}`);
            toast.success('Task deleted');
            navigate('/dashboard');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to delete task'));
        } finally {
            setDeleteLoading(false);
            setShowDeleteDialog(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            'Pending': { class: 'status-badge-pending', label: 'Pending' },
            'Accepted': { class: 'status-badge-accepted', label: 'Accepted' },
            'Declined': { class: 'status-badge-declined', label: 'Declined' },
            'Counter-Proposed': { class: 'status-badge-counter', label: 'Counter-Proposed' },
            'Completed': { class: 'status-badge-completed', label: 'Completed' },
            'Review Pending': { class: 'bg-amber-100 text-amber-800 border-amber-300', label: 'Review Pending' }
        };
        const { class: className, label } = statusMap[status] || { class: '', label: status };
        return (
            <Badge className={`${className} rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide`}>
                {label}
            </Badge>
        );
    };

    const canEdit = user?.id === task?.created_by && task?.status !== 'Completed' && task?.status !== 'Review Pending';
    const canReview = user?.id === task?.created_by && task?.status === 'Review Pending';
    const canDelete = user?.id === task?.created_by || user?.id === task?.assigned_to;

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
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <Button
                        data-testid="back-button"
                        variant="outline"
                        onClick={() => navigate('/dashboard')}
                        className="rounded-full border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Hub
                    </Button>
                    {canDelete && (
                        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                            <DialogTrigger asChild>
                                <Button
                                    data-testid="delete-task-button"
                                    variant="outline"
                                    size="icon"
                                    className="rounded-full border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="rounded-2xl">
                                <DialogHeader>
                                    <DialogTitle className="text-foreground">Delete Task</DialogTitle>
                                    <DialogDescription>
                                        Are you sure you want to delete this task? This action cannot be undone.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="flex gap-2 justify-end pt-4">
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowDeleteDialog(false)}
                                        className="rounded-full"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        data-testid="confirm-delete-button"
                                        variant="destructive"
                                        onClick={handleDeleteTask}
                                        disabled={deleteLoading}
                                        className="rounded-full bg-red-600 hover:bg-red-700 text-white"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        {deleteLoading ? 'Deleting...' : 'Delete'}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    )}
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
                                    <div className="flex items-center gap-3 mb-2">
                                        <CardTitle className="text-4xl" style={{ fontFamily: 'Outfit' }}>{task.title}</CardTitle>
                                        {canEdit && (
                                            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        data-testid="edit-task-button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="rounded-full hover:bg-indigo-100"
                                                    >
                                                        <Pencil className="w-4 h-4 text-indigo-600" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="rounded-2xl max-w-lg">
                                                    <DialogHeader>
                                                        <DialogTitle>Edit Task</DialogTitle>
                                                        <DialogDescription>
                                                            Update task details. The assignee will be notified of changes.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="space-y-4 pt-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="edit-title">Title</Label>
                                                            <Input
                                                                id="edit-title"
                                                                data-testid="edit-title-input"
                                                                value={editForm.title}
                                                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                                                className="rounded-xl"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="edit-description">Description</Label>
                                                            <Textarea
                                                                id="edit-description"
                                                                data-testid="edit-description-input"
                                                                value={editForm.description}
                                                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                                                rows={4}
                                                                className="rounded-xl"
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label htmlFor="edit-due-date">Due Date</Label>
                                                                <Input
                                                                    id="edit-due-date"
                                                                    data-testid="edit-due-date-input"
                                                                    type="datetime-local"
                                                                    value={editForm.due_date}
                                                                    onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                                                                    className="rounded-xl"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label htmlFor="edit-priority">Priority</Label>
                                                                <Select
                                                                    value={editForm.priority}
                                                                    onValueChange={(value) => setEditForm({ ...editForm, priority: value })}
                                                                >
                                                                    <SelectTrigger data-testid="edit-priority-select" className="rounded-xl">
                                                                        <SelectValue placeholder="Select priority" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="Low">Low</SelectItem>
                                                                        <SelectItem value="Medium">Medium</SelectItem>
                                                                        <SelectItem value="High">High</SelectItem>
                                                                        <SelectItem value="Urgent">Urgent</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="edit-category">Category (optional)</Label>
                                                            <Input
                                                                id="edit-category"
                                                                data-testid="edit-category-input"
                                                                value={editForm.category}
                                                                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                                                                placeholder="e.g., Marketing, Development"
                                                                className="rounded-xl"
                                                            />
                                                        </div>
                                                        <div className="flex gap-2 justify-end pt-4">
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => setShowEditDialog(false)}
                                                                className="rounded-full"
                                                            >
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                data-testid="save-edit-button"
                                                                onClick={handleEditTask}
                                                                disabled={editLoading || !editForm.title.trim()}
                                                                className="rounded-full"
                                                            >
                                                                <Save className="w-4 h-4 mr-2" />
                                                                {editLoading ? 'Saving...' : 'Save Changes'}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        )}
                                    </div>
                                    <CardDescription className="text-base">
                                        Created by {task.created_by_name}
                                        {user?.id === task.assigned_to && task.created_by_email && (
                                            <span className="text-xs text-gray-400 ml-1">({task.created_by_email})</span>
                                        )}
                                        {' | '}Assigned to {task.assigned_to_name}
                                        {user?.id === task.created_by && task.assigned_to_email && (
                                            <span className="text-xs text-gray-400 ml-1">({task.assigned_to_email})</span>
                                        )}
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

                            {/* Task Note (from creation) */}
                            {task.note && (
                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                    <Label className="text-gray-700">Note</Label>
                                    <p className="mt-1 text-gray-900">{task.note}</p>
                                    {task.note_images && task.note_images.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {task.note_images.map((img, i) => (
                                                <img key={i} src={img} alt="" className="w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80" onClick={() => window.open(img, '_blank')} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Completion Note - visible to both assigner and assignee */}
                            {(task.completion_note || (task.completion_note_images && task.completion_note_images.length > 0)) && (
                                <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                                    <Label className="text-green-700">Completion Note from {task.assigned_to_name}</Label>
                                    {task.completion_note && <p className="mt-1 text-green-900">{task.completion_note}</p>}
                                    {task.completion_note_images && task.completion_note_images.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {task.completion_note_images.map((img, i) => (
                                                <img key={i} src={img} alt="" className="w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80" onClick={() => window.open(img, '_blank')} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Previous Completion Note (shown when sent back) */}
                            {(task.previous_completion_note || (task.previous_completion_images && task.previous_completion_images.length > 0)) && (
                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                    <Label className="text-gray-600">Previous Submission</Label>
                                    {task.previous_completion_note && <p className="mt-1 text-gray-700">{task.previous_completion_note}</p>}
                                    {task.previous_completion_images && task.previous_completion_images.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {task.previous_completion_images.map((img, i) => (
                                                <img key={i} src={img} alt="" className="w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80" onClick={() => window.open(img, '_blank')} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Review Feedback - visible to assignee when sent back */}
                            {task.review_feedback && (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                    <Label className="text-amber-700 flex items-center gap-2">
                                        <RotateCcw className="w-4 h-4" />
                                        Revision Requested by {task.created_by_name}
                                        {task.created_by_email && (
                                            <span className="text-xs text-amber-500 font-normal">({task.created_by_email})</span>
                                        )}
                                    </Label>
                                    <p className="mt-1 text-amber-900">{task.review_feedback}</p>
                                </div>
                            )}

                            {/* Review Pending Indicator for Creator */}
                            {canReview && (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 text-amber-800 font-medium">
                                            <AlertCircle className="w-5 h-5" />
                                            Your Review Pending
                                        </div>
                                        {task.review_pending_at && (
                                            <div className="text-xs text-amber-600 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Auto-completes in {Math.max(0, Math.ceil(24 - (Date.now() - new Date(task.review_pending_at).getTime()) / 3600000))}h
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-sm text-amber-700 mb-4">The assignee has submitted this task for your review. Please approve or send back with feedback.</p>
                                    <div className="flex gap-2">
                                        <Button onClick={() => handleReviewAction('accept')} disabled={actionLoading} className="rounded-full bg-green-600 hover:bg-green-700 text-white">
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Approve
                                        </Button>
                                        <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="rounded-full border-amber-300 text-amber-800 hover:bg-amber-100">
                                                    <RotateCcw className="w-4 h-4 mr-2" />
                                                    Send Back
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="rounded-2xl">
                                                <DialogHeader>
                                                    <DialogTitle>Send Back for Revision</DialogTitle>
                                                    <DialogDescription>Provide feedback for the assignee</DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-4 pt-4">
                                                    <Textarea placeholder="What needs to be changed?" value={reviewFeedback} onChange={(e) => setReviewFeedback(e.target.value)} rows={4} className="rounded-xl" />
                                                    <div className="flex gap-2 justify-end">
                                                        <Button variant="outline" onClick={() => setShowReviewDialog(false)} className="rounded-full">Cancel</Button>
                                                        <Button onClick={() => handleReviewAction('send_back')} disabled={actionLoading} className="rounded-full">Send Back</Button>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </div>
                            )}

                            {/* Review Pending Indicator for Assignee */}
                            {user?.id === task.assigned_to && task.status === 'Review Pending' && (
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-blue-800 font-medium">
                                            <Clock className="w-5 h-5" />
                                            Awaiting Review
                                        </div>
                                        {task.review_pending_at && (
                                            <div className="text-xs text-blue-600 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Auto-completes in {Math.max(0, Math.ceil(24 - (Date.now() - new Date(task.review_pending_at).getTime()) / 3600000))}h
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-sm text-blue-700 mt-2">Your submission is pending review by {task.created_by_name}.</p>
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
                                    <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
                                        <DialogTrigger asChild>
                                            <Button data-testid="complete-task-button" className="rounded-full">
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                Mark as Complete
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="rounded-2xl">
                                            <DialogHeader>
                                                <DialogTitle>Complete Task</DialogTitle>
                                                <DialogDescription>Add an optional completion note</DialogDescription>
                                            </DialogHeader>
                                            <div className="space-y-4 pt-4">
                                                <Textarea placeholder="Add notes about the completed work (optional)" value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} rows={4} className="rounded-xl" />
                                                <div className="flex items-center gap-2">
                                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                                                        <Image className="w-4 h-4" />
                                                        <span>Attach Screenshots</span>
                                                        <input type="file" accept="image/*" multiple onChange={handleCompletionImageUpload} className="hidden" />
                                                    </label>
                                                    {completionImages.length > 0 && <span className="text-xs text-muted-foreground">{completionImages.length} image(s)</span>}
                                                </div>
                                                {completionImages.length > 0 && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {completionImages.map((img, i) => (
                                                            <div key={i} className="relative">
                                                                <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg" />
                                                                <button type="button" onClick={() => setCompletionImages(completionImages.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="flex gap-2 justify-end">
                                                    <Button variant="outline" onClick={() => setShowCompleteDialog(false)} className="rounded-full">Cancel</Button>
                                                    <Button onClick={handleComplete} disabled={actionLoading} className="rounded-full">
                                                        <CheckCircle className="w-4 h-4 mr-2" />
                                                        {actionLoading ? 'Submitting...' : 'Submit'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
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
