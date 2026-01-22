import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const TaskCard = ({ task, index = 0, showAssignee = false, onComplete, selected = false, onSelect, selectionMode = false }) => {
    const navigate = useNavigate();
    const [completing, setCompleting] = useState(false);
    const [showUndo, setShowUndo] = useState(false);

    const handleCheckboxChange = (e) => {
        e.stopPropagation();
        if (task.status === 'Completed' || task.status !== 'Accepted') return;
        
        setCompleting(true);
        setShowUndo(true);
        
        const timeout = setTimeout(() => {
            if (onComplete) {
                onComplete(task.id);
            }
            setShowUndo(false);
            setCompleting(false);
        }, 3000);
        
        window[`timeout_${task.id}`] = timeout;
    };

    const handleUndo = (e) => {
        e.stopPropagation();
        clearTimeout(window[`timeout_${task.id}`]);
        setShowUndo(false);
        setCompleting(false);
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
            'Completed': { class: 'status-badge-completed', label: 'Completed' }
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
                            ) : task.status === 'Accepted' && (
                                <input
                                    type="checkbox"
                                    checked={completing}
                                    onChange={handleCheckboxChange}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-5 h-5 rounded border-2 border-gray-300 cursor-pointer accent-green-600"
                                    data-testid={`quick-complete-${task.id}`}
                                />
                            )}
                            <h3 className="font-semibold text-lg line-clamp-2 flex-1">{task.title}</h3>
                        </div>
                        {getStatusBadge(task.status)}
                    </div>
                    
                    {showUndo && (
                        <div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
                            <span className="text-sm text-green-800">Completing...</span>
                            <button
                                onClick={handleUndo}
                                className="text-xs font-semibold text-green-900 underline"
                                data-testid={`undo-complete-${task.id}`}
                            >
                                Undo
                            </button>
                        </div>
                    )}
                    
                    <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                    <div className="flex items-center justify-between text-sm">
                        <span className={getPriorityClass(task.priority)}>{task.priority}</span>
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
    );
};

export default TaskCard;
