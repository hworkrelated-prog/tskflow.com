import React, { useState, useEffect, useRef } from 'react';
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
import { ArrowLeft, CheckCircle, XCircle, Clock, Pencil, Save, Trash2, Image, X, AlertCircle, RotateCcw, MessageSquare, Share2, Mail, Copy, Users } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { getErrorMessage } from '@/lib/utils';
import AttachmentViewer from '@/components/AttachmentViewer';
import RichTextEditor from '@/components/RichTextEditor';

const TaskDetail = () => {
    const { taskId, token } = useParams();
    const { user } = useAuth();
    const isFreeUser = user?.subscription_tier === 'free';
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    // Parent-task specific state
    const [subtasks, setSubtasks] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const [showAllParticipants, setShowAllParticipants] = useState(false);
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
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [showComments, setShowComments] = useState(false);
    const [commentLoading, setCommentLoading] = useState(false);
    const [aiSummary, setAiSummary] = useState(null);
    const [loadingAiSummary, setLoadingAiSummary] = useState(false);
    // Chatter mention state
    const [mentionUsers, setMentionUsers] = useState([]);
    const [showMentionSuggest, setShowMentionSuggest] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const [mentionHighlight, setMentionHighlight] = useState(0);
    const [pendingMentions, setPendingMentions] = useState([]); // [{userId, marker}]
    const commentTextareaRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchTask();
        if (taskId) fetchComments();
    }, [taskId, token]);

    // Real-time chatter — refresh when server pushes a new_comment for this task
    useEffect(() => {
        const handler = (e) => {
            if (e.detail?.task_id === (task?.id || taskId)) fetchComments();
        };
        window.addEventListener('tskflow:new_comment', handler);
        return () => window.removeEventListener('tskflow:new_comment', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task?.id, taskId]);

    // Mark task viewed by assignee on open (populates the "Viewed" status column)
    useEffect(() => {
        const id = task?.id || taskId;
        if (!id) return;
        (async () => { try { await axios.post(`${API}/tasks/${id}/mark-viewed`); } catch (_) { /* silent */ } })();
    }, [task?.id, taskId]);

    // Fetch mentionable users once
    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get(`${API}/users/mentionable`);
                setMentionUsers(res.data || []);
            } catch (_) {
                try {
                    const legacy = await axios.get(`${API}/users`);
                    setMentionUsers(legacy.data || []);
                } catch (__) { /* silent */ }
            }
        })();
    }, []);

    // Fuzzy filter for mention drop-down
    const fuzzyScore = (haystack, needle) => {
        const h = (haystack || '').toLowerCase();
        const n = (needle || '').toLowerCase().trim();
        if (!n) return 0;
        if (h.startsWith(n)) return 0;
        const idx = h.indexOf(n);
        if (idx !== -1) return 1 + idx;
        let hi = 0; let miss = 0;
        for (const ch of n) {
            const next = h.indexOf(ch, hi);
            if (next === -1) return 999;
            miss += next - hi;
            hi = next + 1;
        }
        return 10 + miss;
    };

    const filteredMentionUsers = mentionUsers
        .map((u) => ({ u, score: Math.min(fuzzyScore(u.name, mentionSearch), fuzzyScore((u.email || '').split('@')[0], mentionSearch)) }))
        .filter((x) => x.score < 999)
        .sort((a, b) => a.score - b.score)
        .slice(0, 6)
        .map((x) => x.u);

    const onCommentChange = (e) => {
        const value = e.target.value;
        setNewComment(value);
        const caret = e.target.selectionStart ?? value.length;
        const before = value.slice(0, caret);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) { setShowMentionSuggest(false); return; }
        const between = before.slice(atIdx + 1);
        if (/\s/.test(between)) { setShowMentionSuggest(false); return; }
        setMentionSearch(between.toLowerCase());
        setShowMentionSuggest(true);
        setMentionHighlight(0);
    };

    const insertMention = (u) => {
        const el = commentTextareaRef.current;
        const caret = el?.selectionStart ?? newComment.length;
        const before = newComment.slice(0, caret);
        const after = newComment.slice(caret);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) return;
        const handle = u.name.replace(/\s+/g, '');
        const marker = `@${handle}`;
        const newVal = `${newComment.slice(0, atIdx)}${marker} ${after}`;
        setNewComment(newVal);
        setPendingMentions((prev) => (prev.find((p) => p.userId === u.id) ? prev : [...prev, { userId: u.id, marker }]));
        setShowMentionSuggest(false);
        requestAnimationFrame(() => {
            if (!el) return;
            const pos = atIdx + marker.length + 1;
            el.focus();
            try { el.setSelectionRange(pos, pos); } catch (_) { /* noop */ }
        });
    };

    const onCommentKeyDown = (e) => {
        if (!showMentionSuggest || filteredMentionUsers.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight((i) => Math.min(i + 1, filteredMentionUsers.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentionUsers[mentionHighlight]); }
        else if (e.key === 'Escape') { setShowMentionSuggest(false); }
    };

    const fetchTask = async () => {
        try {
            let response;
            if (token) {
                // Access via shareable link
                response = await axios.get(`${API}/tasks/shared/${token}`);
            } else {
                // Access via task ID
                response = await axios.get(`${API}/tasks/${taskId}`);
            }
            setTask(response.data);
            setEditForm({
                title: response.data.title,
                description: response.data.description || '',
                due_date: response.data.due_date ? response.data.due_date.slice(0, 16) : '',
                priority: response.data.priority,
                category: response.data.category || ''
            });
            // If this is a parent task, load participants + leaderboard for the collapsible section
            if (response.data.is_parent) {
                const pid = response.data.id;
                axios.get(`${API}/tasks/parents/${pid}/subtasks`).then((r) => {
                    setSubtasks(Array.isArray(r.data) ? r.data : (r.data?.subtasks || []));
                }).catch(() => setSubtasks([]));
                axios.get(`${API}/tasks/${pid}/leaderboard`).then((r) => {
                    setLeaderboard(r.data?.leaderboard || []);
                }).catch(() => setLeaderboard([]));
            }
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to load task'));
            navigate('/dashboard');
        } finally {
            setLoading(false);
        }
    };

    const fetchComments = async () => {
        try {
            const id = task?.id || taskId;
            const response = await axios.get(`${API}/tasks/${id}/comments`);
            setComments(response.data.comments || []);
        } catch (error) {
            console.error('Failed to fetch comments', error);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        
        setCommentLoading(true);
        try {
            const id = task?.id || taskId;
            // Map still-present markers back to user IDs
            const mentions = pendingMentions
                .filter((m) => newComment.includes(m.marker))
                .map((m) => m.userId);
            
            await axios.post(`${API}/tasks/${id}/comments`, {
                content: newComment,
                mentions,
            });
            
            setNewComment('');
            setPendingMentions([]);
            fetchComments();
            toast.success('Comment added');
        } catch (error) {
            toast.error('Failed to add comment');
        } finally {
            setCommentLoading(false);
        }
    };

    const handleCopyShareableLink = () => {
        if (task?.shareable_token) {
            const link = `${window.location.origin}/task-shared/${task.shareable_token}`;
            navigator.clipboard.writeText(link);
            toast.success('Shareable link copied to clipboard!');
        }
    };

    const handleSendEmail = async () => {
        try {
            const id = task?.id || taskId;
            await axios.post(`${API}/tasks/${id}/send-email`);
            toast.success('Email sent to assignee');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to send email'));
        }
    };

    const fetchAiSummary = async () => {
        setLoadingAiSummary(true);
        try {
            const id = task?.id || taskId;
            const response = await axios.post(`${API}/tasks/${id}/ai-summary`);
            setAiSummary(response.data.summary);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to generate AI summary'));
        } finally {
            setLoadingAiSummary(false);
        }
    };

    const handleAccept = async () => {
        setActionLoading(true);
        try {
            const response = await axios.put(`${API}/tasks/${taskId}/accept`);
            if (response.data.calendar_scheduled) {
                toast.success('Task accepted & scheduled on your calendar!', {
                    description: '30-minute time block created',
                    duration: 5000
                });
            } else {
                toast.success('Task accepted!');
            }
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

    const handleAcceptCounterProposal = async () => {
        setActionLoading(true);
        try {
            const id = task?.id || taskId;
            await axios.put(`${API}/tasks/${id}/accept-counter-proposal`);
            toast.success('Counter-proposal accepted!');
            fetchTask();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to accept counter-proposal'));
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

    // Review a single subtask from the parent group task view (approve / send back)
    const [subtaskReviewFor, setSubtaskReviewFor] = useState(null); // { id, name, note }
    const [subtaskReviewFeedback, setSubtaskReviewFeedback] = useState('');
    const [subtaskReviewLoading, setSubtaskReviewLoading] = useState(false);

    const refreshParentSubtasks = async () => {
        try {
            const id = task?.id || taskId;
            const r = await axios.get(`${API}/tasks/parents/${id}/subtasks`);
            setSubtasks(Array.isArray(r.data) ? r.data : (r.data?.subtasks || []));
        } catch { /* silent */ }
        try {
            const id = task?.id || taskId;
            const r = await axios.get(`${API}/tasks/${id}/leaderboard`);
            setLeaderboard(r.data?.leaderboard || []);
        } catch { /* silent */ }
    };

    const handleSubtaskReview = async (subtaskId, action, feedback = null) => {
        setSubtaskReviewLoading(true);
        try {
            await axios.put(`${API}/tasks/${subtaskId}/review`, { action, feedback });
            toast.success(action === 'accept' ? 'Submission approved' : 'Sent back for revision');
            setSubtaskReviewFor(null);
            setSubtaskReviewFeedback('');
            await refreshParentSubtasks();
        } catch (err) {
            toast.error(getErrorMessage(err, 'Failed to review submission'));
        } finally { setSubtaskReviewLoading(false); }
    };

    // Nudge everyone in a parent group who hasn't finished yet
    const [nudging, setNudging] = useState(false);
    const handleNudgeUnfinished = async () => {
        const id = task?.id || taskId;
        setNudging(true);
        try {
            const res = await axios.post(`${API}/tasks/parents/${id}/remind`);
            toast.success(`Reminder sent to ${res.data?.reminded ?? 'unfinished'} teammate(s)`);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Failed to send reminders'));
        } finally { setNudging(false); }
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

            <main className="container mx-auto px-6 py-8 max-w-7xl">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
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
                                                            <RichTextEditor
                                                                value={editForm.description}
                                                                onChange={(value) => setEditForm({ ...editForm, description: value })}
                                                                placeholder="Enter task description..."
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
                                    <p className="font-semibold text-lg">{task.due_date && !isNaN(new Date(task.due_date).getTime()) ? format(new Date(task.due_date), 'MMM dd, yyyy h:mm a') : 'No date'}</p>
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
                                <div 
                                    className="mt-2 text-base leading-relaxed prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: task.description || '' }}
                                />
                            </div>

                            {task.attachments && task.attachments.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between">
                                        <Label className="text-muted-foreground">Attachments & Recordings</Label>
                                        {task.status === 'Completed' && task.attachments.some(a => a.kind === 'video') && (
                                            <p className="text-xs text-amber-700">
                                                ⚠️ Recordings auto-delete 24h after completion. Download to keep.
                                            </p>
                                        )}
                                    </div>
                                    <div className="mt-2">
                                        <AttachmentViewer attachments={task.attachments} />
                                    </div>
                                </div>
                            )}

                            {/* Participants + Leaderboard (only for parent/group tasks) */}
                            {task.is_parent && (
                                <ParticipantsSection
                                    subtasks={subtasks}
                                    leaderboard={leaderboard}
                                    showAll={showAllParticipants}
                                    setShowAll={setShowAllParticipants}
                                    isCreator={user?.id === task.created_by}
                                    onReviewSubtask={(sub) => { setSubtaskReviewFor(sub); setSubtaskReviewFeedback(''); }}
                                    onNudge={handleNudgeUnfinished}
                                    nudging={nudging}
                                />
                            )}

                            {/* Action Buttons: Share, Email, Comments */}
                            <div className="flex gap-2 flex-wrap pt-4 border-t">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchAiSummary}
                                    disabled={loadingAiSummary}
                                    className="rounded-full"
                                >
                                    ✨ {loadingAiSummary ? 'Generating...' : 'AI Summary'}
                                </Button>
                                
                                {task.shareable_token && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopyShareableLink}
                                        className="rounded-full"
                                    >
                                        <Share2 className="w-4 h-4 mr-2" />
                                        Copy Shareable Link
                                    </Button>
                                )}
                                
                                {user?.id === task.created_by && task.assigned_to !== user?.id && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSendEmail}
                                        className="rounded-full"
                                    >
                                        <Mail className="w-4 h-4 mr-2" />
                                        Email Assignee
                                    </Button>
                                )}
                                
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowComments(!showComments)}
                                    className="rounded-full"
                                >
                                    <MessageSquare className="w-4 h-4 mr-2" />
                                    Comments ({comments.length})
                                </Button>
                            </div>

                            {/* AI Summary */}
                            {aiSummary && (
                                <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-lg">🤖</span>
                                        <Label className="text-purple-700 font-semibold">AI Summary</Label>
                                    </div>
                                    <p className="text-sm text-purple-900">{aiSummary}</p>
                                </div>
                            )}

                            {/* Comments Section */}
                            {showComments && (
                                <div className="space-y-4 p-4 bg-gray-50 rounded-xl border">
                                    <div className="space-y-3">
                                        {comments.length === 0 ? (
                                            <p className="text-center text-gray-500 text-sm">No comments yet. Be the first to comment!</p>
                                        ) : (
                                            comments.map((comment) => (
                                                <div key={comment.id} className="bg-white p-3 rounded-lg shadow-sm">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-semibold text-sm">{comment.user_name}</span>
                                                        <span className="text-xs text-gray-500">
                                                            {comment.created_at && !isNaN(new Date(comment.created_at).getTime()) 
                                                                ? format(new Date(comment.created_at), 'MMM dd, h:mm a')
                                                                : ''}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-700">{comment.content}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    
                                    <div className="space-y-2 pt-3 border-t">
                                        <div className="relative">
                                            <Textarea
                                                ref={commentTextareaRef}
                                                placeholder="Add a comment... (type @ to mention users)"
                                                value={newComment}
                                                onChange={onCommentChange}
                                                onKeyDown={onCommentKeyDown}
                                                rows={3}
                                                className="rounded-lg"
                                            />
                                            {showMentionSuggest && filteredMentionUsers.length > 0 && (
                                                <div className="absolute bottom-full mb-2 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto z-30">
                                                    {filteredMentionUsers.map((u, idx) => (
                                                        <button
                                                            key={u.id}
                                                            type="button"
                                                            onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                                                            onMouseEnter={() => setMentionHighlight(idx)}
                                                            className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                                                                idx === mentionHighlight ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <span className="font-medium">{u.name}</span>
                                                            <span className="text-xs text-gray-500">{u.email}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-end">
                                            <Button
                                                onClick={handleAddComment}
                                                disabled={commentLoading || !newComment.trim()}
                                                size="sm"
                                                className="rounded-full"
                                            >
                                                {commentLoading ? 'Posting...' : 'Post Comment'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                        Proposed Date: {task.proposed_due_date && !isNaN(new Date(task.proposed_due_date).getTime()) ? format(new Date(task.proposed_due_date), 'MMM dd, yyyy h:mm a') : '—'}
                                    </p>
                                    {user?.id === task.created_by && task.status === 'Counter-Proposed' && (
                                        <div className="flex gap-2 mt-3">
                                            <Button
                                                onClick={handleAcceptCounterProposal}
                                                size="sm"
                                                className="rounded-full bg-green-600 hover:bg-green-700"
                                            >
                                                Accept Proposal
                                            </Button>
                                            <Button
                                                onClick={handleDecline}
                                                size="sm"
                                                variant="outline"
                                                className="rounded-full"
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Task Note (from creation) */}
                            {(task.note || (task.note_images && task.note_images.length > 0)) && (
                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                    <Label className="text-gray-700">Note</Label>
                                    {task.note && <p className="mt-1 text-gray-900">{task.note}</p>}
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

                            {/* Who completed the task */}
                            {task.status === 'Completed' && task.completed_by_name && (
                                <div className="flex items-center gap-2 text-sm text-green-700" data-testid="completed-by">
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Completed by <span className="font-semibold">{task.completed_by_name}</span></span>
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
                                                {!isFreeUser && (
                                                    <>
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
                                                    </>
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

                {/* Right-side Chatter panel (always visible on desktop) */}
                <aside className="hidden lg:block lg:sticky lg:top-24">
                    <Card className="border-2 rounded-2xl">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-2 mb-4">
                                <MessageSquare className="w-5 h-5 text-indigo-600" />
                                <h3 className="font-semibold">Chatter</h3>
                                <span className="ml-auto text-xs text-muted-foreground">{comments.length} messages</span>
                            </div>
                            <div className="space-y-3 mb-3 max-h-[50vh] overflow-y-auto">
                                {comments.length === 0 ? (
                                    <p className="text-center text-sm text-gray-500 py-6">No messages yet. Start the conversation.</p>
                                ) : (
                                    comments.map((c) => (
                                        <div key={c.id} className="bg-gray-50 p-3 rounded-lg">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold text-sm">{c.user_name}</span>
                                                <span className="text-xs text-gray-500">{c.created_at && format(new Date(c.created_at), 'MMM d, h:mm a')}</span>
                                            </div>
                                            <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="relative">
                                <Textarea
                                    ref={commentTextareaRef}
                                    placeholder="Type @ to mention..."
                                    value={newComment}
                                    onChange={onCommentChange}
                                    onKeyDown={onCommentKeyDown}
                                    rows={3}
                                    className="rounded-lg"
                                />
                                {showMentionSuggest && filteredMentionUsers.length > 0 && (
                                    <div className="absolute bottom-full mb-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto z-30">
                                        {filteredMentionUsers.map((u, idx) => (
                                            <button key={u.id} type="button"
                                                onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                                                onMouseEnter={() => setMentionHighlight(idx)}
                                                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${idx === mentionHighlight ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-gray-50'}`}
                                            >
                                                <span className="font-medium truncate">{u.name}</span>
                                                <span className="text-xs text-gray-500 truncate ml-2">{u.email}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex justify-end mt-2">
                                    <Button size="sm" onClick={handleAddComment} disabled={commentLoading || !newComment.trim()} className="rounded-full">
                                        {commentLoading ? 'Posting...' : 'Post'}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </aside>
                </div>
            </main>

            {/* Subtask review modal — for parent/group tasks, review each assignee's submission individually */}
            <Dialog open={Boolean(subtaskReviewFor)} onOpenChange={(o) => { if (!o) { setSubtaskReviewFor(null); setSubtaskReviewFeedback(''); } }}>
                <DialogContent className="rounded-2xl max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Review submission — {subtaskReviewFor?.name}</DialogTitle>
                        <DialogDescription>Approve their work or send it back with feedback.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {subtaskReviewFor?.completion_note && (
                            <div className="rounded-xl bg-gray-50 border p-3 max-h-48 overflow-y-auto">
                                <p className="text-xs text-muted-foreground mb-1">Completion note</p>
                                <p className="text-sm whitespace-pre-wrap">{subtaskReviewFor.completion_note}</p>
                            </div>
                        )}
                        {Array.isArray(subtaskReviewFor?.completion_note_images) && subtaskReviewFor.completion_note_images.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {subtaskReviewFor.completion_note_images.map((img, i) => (
                                    <img key={i} src={img} alt="attachment" className="w-24 h-24 object-cover rounded-lg border" />
                                ))}
                            </div>
                        )}
                        <Textarea placeholder="Optional feedback if sending back for revision..." rows={3} value={subtaskReviewFeedback} onChange={(e) => setSubtaskReviewFeedback(e.target.value)} className="rounded-xl" data-testid="subtask-review-feedback" />
                    </div>
                    <div className="flex gap-2 justify-end pt-3">
                        <Button variant="outline" onClick={() => { setSubtaskReviewFor(null); setSubtaskReviewFeedback(''); }} className="rounded-full">Cancel</Button>
                        <Button
                            variant="outline"
                            onClick={() => handleSubtaskReview(subtaskReviewFor.subtaskId, 'send_back', subtaskReviewFeedback || null)}
                            disabled={subtaskReviewLoading}
                            className="rounded-full border-amber-300 text-amber-800 hover:bg-amber-50"
                            data-testid="subtask-send-back-btn"
                        >
                            <RotateCcw className="w-4 h-4 mr-1" /> Send Back
                        </Button>
                        <Button
                            onClick={() => handleSubtaskReview(subtaskReviewFor.subtaskId, 'accept')}
                            disabled={subtaskReviewLoading}
                            className="rounded-full bg-green-600 hover:bg-green-700 text-white"
                            data-testid="subtask-approve-btn"
                        >
                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default TaskDetail;

// ---- Participants section for parent/group tasks ----
const statusRank = (s) => {
    if (s === 'Pending') return 0;
    if (s === 'Accepted' || s === 'In Progress') return 1;
    if (s === 'Review Pending') return 2;
    if (s === 'Completed') return 3;
    return 1;
};

const ParticipantsSection = ({ subtasks, leaderboard, showAll, setShowAll, isCreator = false, onReviewSubtask, onNudge, nudging = false }) => {
    // Merge subtasks + leaderboard entries for status columns
    const rows = React.useMemo(() => {
        const byId = {};
        subtasks.forEach((t) => { byId[t.assigned_to] = t; });
        const merged = leaderboard.map((lb) => {
            const t = byId[lb.assignee_id || lb.user_id] || {};
            const status = t.status || lb.status || 'Pending';
            return {
                key: t.id || lb.task_id || lb.user_id,
                subtaskId: t.id || lb.task_id,
                name: t.assigned_to_name || lb.name || 'Unknown',
                email: t.assigned_to_email,
                status,
                completion_hours: lb.completion_hours ?? null,
                completed: status === 'Completed',
                submitted: ['Review Pending', 'Completed'].includes(status),
                accepted: ['Accepted', 'In Progress', 'Review Pending', 'Completed'].includes(status),
                viewed: Boolean(t.viewed_at) || ['Accepted', 'In Progress', 'Review Pending', 'Completed'].includes(status),
                completion_note: t.completion_note,
                completion_note_images: t.completion_note_images,
            };
        });
        // If leaderboard was empty, fall back to subtasks
        if (merged.length === 0) {
            subtasks.forEach((t) => {
                merged.push({
                    key: t.id,
                    subtaskId: t.id,
                    name: t.assigned_to_name || t.assigned_to_email || 'Unknown',
                    email: t.assigned_to_email,
                    status: t.status || 'Pending',
                    completion_hours: null,
                    completed: t.status === 'Completed',
                    submitted: ['Review Pending', 'Completed'].includes(t.status),
                    accepted: ['Accepted', 'In Progress', 'Review Pending', 'Completed'].includes(t.status),
                    viewed: Boolean(t.viewed_at) || ['Accepted', 'In Progress', 'Review Pending', 'Completed'].includes(t.status),
                    completion_note: t.completion_note,
                    completion_note_images: t.completion_note_images,
                });
            });
        }
        // Pending (not completed) on top; within group sort by statusRank ascending
        merged.sort((a, b) => statusRank(a.status) - statusRank(b.status));
        return merged;
    }, [subtasks, leaderboard]);

    if (rows.length === 0) return null;
    const visible = showAll ? rows : rows.slice(0, 5);
    const completedCount = rows.filter((r) => r.completed).length;
    const unfinishedCount = rows.length - completedCount;
    const pct = Math.round((completedCount / rows.length) * 100);

    return (
        <div className="border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-b flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold">Participants ({rows.length})</span>
                    <span className="text-xs text-muted-foreground">— pending first, completed at the bottom</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-emerald-700">{completedCount}/{rows.length} done · {pct}%</span>
                    {isCreator && unfinishedCount > 0 && onNudge && (
                        <Button size="sm" variant="outline" onClick={onNudge} disabled={nudging} className="rounded-full h-7 px-3 text-xs" data-testid="nudge-unfinished-btn">
                            <Mail className="w-3.5 h-3.5 mr-1" /> {nudging ? 'Sending...' : `Nudge ${unfinishedCount}`}
                        </Button>
                    )}
                </div>
            </div>
            <ul className="divide-y">
                {visible.map((r, i) => (
                    <li key={r.key || i} className={`flex items-center gap-3 px-4 py-2.5 ${r.completed ? 'bg-emerald-50/40' : ''}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${r.completed ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-700'}`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{r.name}</div>
                            <div className="flex gap-1 mt-0.5 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.viewed ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>Viewed</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.accepted ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>Accepted</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.submitted ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>Submitted</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>Completed</span>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500 shrink-0">{r.completion_hours ? `${r.completion_hours}h` : '—'}</div>
                        {isCreator && r.status === 'Review Pending' && r.subtaskId && onReviewSubtask && (
                            <Button
                                size="sm"
                                onClick={() => onReviewSubtask(r)}
                                className="rounded-full h-7 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white shrink-0"
                                data-testid={`review-subtask-${r.subtaskId}`}
                            >
                                Review
                            </Button>
                        )}
                    </li>
                ))}
            </ul>
            {rows.length > 5 && (
                <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="w-full py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 border-t"
                    data-testid="participants-show-more"
                >
                    {showAll ? 'Show less' : `Show ${rows.length - 5} more`}
                </button>
            )}
        </div>
    );
};
