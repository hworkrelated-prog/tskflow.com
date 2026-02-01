import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Image, X, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const TaskCard = ({ task, index = 0, showAssignee = false, onComplete, selected = false, onSelect, selectionMode = false }) => {
    const navigate = useNavigate();
    const [showCompleteDialog, setShowCompleteDialog] = useState(false);
    const [completionNote, setCompletionNote] = useState('');
    const [completionImages, setCompletionImages] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const handleCheckboxClick = (e) => {
        e.stopPropagation();
        if (task.status === 'Completed' || task.status !== 'Accepted') return;
        setShowCompleteDialog(true);
    };

    const handleImageUpload = (e) => {
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

    const handleSubmitCompletion = async () => {
        if (!onComplete) return;
        setSubmitting(true);
        await onComplete(task.id, completionNote || null, completionImages.length > 0 ? completionImages : null);
        setSubmitting(false);
        setShowCompleteDialog(false);
        setCompletionNote('');
        setCompletionImages([]);
    };

    const handleSelectionToggle = (e) => {
        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
        if (onSelect) {
            onSelect(task.id);
        }
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            'Pending': { class: 'status-badge-pending', label: 'Pending' },
            'Accepted': { class: 'status-badge-accepted', label: 'Accepted' },
            'Declined': { class: 'status-badge-declined', label: 'Declined' },
            'Counter-Proposed': { class: 'status-badge-counter', label: 'Counter-Proposed' },
            'Completed': { class: 'status-badge-completed', label: 'Completed' },
            'Review Pending': { class: 'bg-amber-100 text-amber-800', label: 'Review Pending' }
        };
        const { class: className, label } = statusMap[status] || { class: '', label: status };
        return (
            <Badge className={`${className} rounded-md px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide`}>
                {label}
            </Badge>
        );
    };

    const getPriorityClass = (priority) => {
        const map = { 'High': 'priority-high', 'Urgent': 'priority-high', 'Medium': 'priority-medium', 'Low': 'priority-low' };
        return map[priority] || '';
    };

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
            >
                <Card
                    data-testid={`task-card-${task.id}`}
                    className={`group relative overflow-hidden rounded-xl border bg-card p-6 transition-all cursor-pointer task-card ${selected ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : ''}`}
                    onClick={() => !selectionMode && navigate(`/task/${task.id}`)}
                >
                    <CardContent className="p-0 space-y-3">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3 flex-1">
                                {selectionMode ? (
                                    <Checkbox
                                        checked={selected}
                                        onCheckedChange={handleSelectionToggle}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-5 h-5"
                                        data-testid={`select-task-${task.id}`}
                                    />
                                ) : task.status === 'Accepted' && onComplete && (
                                    <input
                                        type="checkbox"
                                        checked={false}
                                        onChange={() => {}}
                                        onClick={handleCheckboxClick}
                                        className="w-5 h-5 rounded border-2 border-gray-300 cursor-pointer accent-green-600"
                                        data-testid={`quick-complete-${task.id}`}
                                    />
                                )}
                                <h3 className="font-semibold text-lg line-clamp-2 flex-1 text-foreground">{task.title}</h3>
                            </div>
                            {getStatusBadge(task.status)}
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                                <span className={getPriorityClass(task.priority)}>{task.priority}</span>
                                {task.calendar_event_id && (
                                    <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                        <Calendar className="w-3 h-3" />
                                        Scheduled
                                    </span>
                                )}
                            </div>
                            <span className="text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {format(new Date(task.due_date), 'MMM dd')}
                            </span>
                        </div>
                        {showAssignee ? (
                            <div className="text-xs text-muted-foreground pt-2 border-t">
                                Assigned to: <span className="font-medium">{task.assigned_to_name}</span>
                            </div>
                        ) : task.created_by !== task.assigned_to && (
                            <div className="text-xs text-muted-foreground pt-2 border-t">
                                From {task.created_by_name}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            {/* Completion Dialog */}
            <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
                <DialogContent className="rounded-2xl" onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Complete Task</DialogTitle>
                        <DialogDescription>Add an optional note about the completed work</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <Textarea
                            placeholder="Completion note (optional)"
                            value={completionNote}
                            onChange={(e) => setCompletionNote(e.target.value)}
                            rows={3}
                            className="rounded-xl"
                        />
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                                <Image className="w-4 h-4" />
                                <span>Attach Screenshot</span>
                                <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
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
                            <Button variant="outline" onClick={() => setShowCompleteDialog(false)} className="rounded-full border-gray-300 text-gray-700 hover:bg-gray-100">Cancel</Button>
                            <Button onClick={handleSubmitCompletion} disabled={submitting} className="rounded-full bg-green-600 hover:bg-green-700 text-white">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {submitting ? 'Submitting...' : 'Mark Complete'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default TaskCard;
