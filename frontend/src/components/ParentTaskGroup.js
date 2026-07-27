import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Users, Clock, Trash2, ChevronRight, Trophy } from 'lucide-react';
import { format } from 'date-fns';

/**
 * A ParentTaskGroup card that navigates straight to the group task detail page
 * (with leaderboard + chatter) instead of expanding to show participants inline.
 */
export const ParentTaskGroup = ({ group, onChanged }) => {
    const [deleting, setDeleting] = useState(false);
    const navigate = useNavigate();

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

    const complete = group.percent === 100;

    return (
        <Card
            className="border-2 rounded-2xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => navigate(`/group-task/${group.id}`)}
            data-testid={`parent-group-card-${group.id}`}
        >
            <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                            <h3 className="font-semibold text-base truncate">{group.title}</h3>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                            <span>{group.completed}/{group.total} done</span>
                            <span>·</span>
                            <Clock className="w-3 h-3" />
                            {group.due_date && !isNaN(new Date(group.due_date).getTime())
                                ? format(new Date(group.due_date), 'MMM dd')
                                : 'No date'}
                            <span>·</span>
                            <Trophy className="w-3 h-3 text-amber-500" />
                            <span className="text-amber-700">Leaderboard</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Badge
                            className={complete ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}
                        >
                            {group.percent}%
                        </Badge>
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
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                </div>
                <div className="mt-3">
                    <Progress value={group.percent} className="h-2" />
                </div>
            </div>
        </Card>
    );
};

export default ParentTaskGroup;
