import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const TaskCard = ({ task, index = 0 }) => {
    const navigate = useNavigate();

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
        const map = { 'High': 'priority-high', 'Medium': 'priority-medium', 'Low': 'priority-low' };
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
                className="group relative overflow-hidden rounded-xl border bg-card p-6 transition-all cursor-pointer task-card"
                onClick={() => navigate(`/task/${task.id}`)}
            >
                <CardContent className="p-0 space-y-3">
                    <div className="flex items-start justify-between">
                        <h3 className="font-semibold text-lg line-clamp-2">{task.title}</h3>
                        {getStatusBadge(task.status)}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                    <div className="flex items-center justify-between text-sm">
                        <span className={getPriorityClass(task.priority)}>{task.priority}</span>
                        <span className="text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(task.due_date), 'MMM dd')}
                        </span>
                    </div>
                    {task.created_by !== task.assigned_to && (
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                            {task.created_by_name === task.assigned_to_name ? 
                                `Self-assigned` : 
                                `From ${task.created_by_name}`
                            }
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default TaskCard;
