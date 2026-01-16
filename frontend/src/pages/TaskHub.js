import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, LogOut, BarChart3, Settings, HelpCircle, Crown } from 'lucide-react';
import TaskCard from '@/components/TaskCard';
import { motion } from 'framer-motion';

const TaskHub = () => {
    const { user, logout } = useAuth();
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [taskForm, setTaskForm] = useState({
        title: '',
        description: '',
        assigned_to: '',
        due_date: '',
        priority: 'Medium',
        category: ''
    });
    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboard();
        fetchUsers();
    }, []);

    const fetchDashboard = async () => {
        try {
            const response = await axios.get(`${API}/dashboard`);
            setDashboard(response.data);
        } catch (error) {
            toast.error('Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`${API}/users`);
            setUsers(response.data);
        } catch (error) {
            console.error('Failed to fetch users');
        }
    };

    const handleQuickComplete = async (taskId) => {
        try {
            await axios.put(`${API}/tasks/${taskId}/complete`);
            toast.success('Task completed!');
            fetchDashboard();
        } catch (error) {
            toast.error('Failed to complete task');
        }
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        
        if (dashboard?.task_limit_reached) {
            toast.error('Free tier limit reached. Upgrade to Pro for unlimited tasks!');
            return;
        }

        setCreateLoading(true);
        try {
            await axios.post(`${API}/tasks`, taskForm);
            toast.success('Task created successfully!');
            setShowCreateModal(false);
            setTaskForm({
                title: '',
                description: '',
                assigned_to: '',
                due_date: '',
                priority: 'Medium',
                category: ''
            });
            fetchDashboard();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to create task');
        } finally {
            setCreateLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium">Loading your tasks...</div>
            </div>
        );
    }

    return (
        <div data-testid="task-hub" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            {/* Header */}
            <header className="sticky top-0 z-50 glass-header border-b">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Outfit' }}>Task Hub</h1>
                        {user?.subscription_tier === 'teams' ? (
                            <Badge className="bg-indigo-600 text-white rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1">
                                <Crown className="w-3 h-3" />
                                TEAMS
                            </Badge>
                        ) : user?.subscription_tier === 'pro' ? (
                            <Badge className="subscription-badge-pro rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1">
                                <Crown className="w-3 h-3" />
                                PRO
                            </Badge>
                        ) : (
                            <Badge className="subscription-badge-free rounded-full px-3 py-1 text-xs font-semibold">
                                FREE
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full"
                            data-testid="help-button"
                        >
                            <HelpCircle className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => navigate('/analytics')}
                            className="rounded-full"
                            data-testid="analytics-button"
                        >
                            <BarChart3 className="w-5 h-5 mr-2" />
                            Analytics
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => navigate('/settings')}
                            className="rounded-full"
                            data-testid="settings-button"
                        >
                            <Settings className="w-5 h-5 mr-2" />
                            Settings
                        </Button>
                        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                            <DialogTrigger asChild>
                                <Button
                                    data-testid="create-task-button"
                                    className="rounded-full shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                                    disabled={dashboard?.task_limit_reached}
                                >
                                    <Plus className="w-5 h-5 mr-2" />
                                    New Task
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl rounded-2xl">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Create New Task</DialogTitle>
                                    <DialogDescription>Assign a task to yourself or others</DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleCreateTask} className="space-y-4 mt-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="title">Task Title</Label>
                                        <Input
                                            id="title"
                                            data-testid="task-title-input"
                                            placeholder="Enter task title"
                                            value={taskForm.title}
                                            onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                                            required
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description</Label>
                                        <Textarea
                                            id="description"
                                            data-testid="task-description-input"
                                            placeholder="Describe the task"
                                            value={taskForm.description}
                                            onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                                            required
                                            rows={4}
                                            className="rounded-xl"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="assigned_to">Assign To</Label>
                                            <Select
                                                value={taskForm.assigned_to}
                                                onValueChange={(value) => setTaskForm({ ...taskForm, assigned_to: value })}
                                                required
                                            >
                                                <SelectTrigger data-testid="assign-to-select" className="rounded-xl">
                                                    <SelectValue placeholder="Select or type email" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="self">Self (Me)</SelectItem>
                                                    {users.filter(u => u.id !== user?.id).map((u) => (
                                                        <SelectItem key={u.id} value={u.id}>
                                                            {u.name} ({u.email})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Input
                                                placeholder="Or type email address"
                                                value={taskForm.assigned_to.includes('@') ? taskForm.assigned_to : ''}
                                                onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                                                className="rounded-xl mt-2"
                                                type="email"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Can assign to anyone by email - they&apos;ll receive an invitation
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="priority">Priority</Label>
                                            <Select
                                                value={taskForm.priority}
                                                onValueChange={(value) => setTaskForm({ ...taskForm, priority: value })}
                                            >
                                                <SelectTrigger data-testid="priority-select" className="rounded-xl">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Low">Low</SelectItem>
                                                    <SelectItem value="Medium">Medium</SelectItem>
                                                    <SelectItem value="High">High</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="due_date">Due Date</Label>
                                            <Input
                                                id="due_date"
                                                data-testid="due-date-input"
                                                type="datetime-local"
                                                value={taskForm.due_date}
                                                onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                                                required
                                                className="rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="category">Category (optional)</Label>
                                            <Input
                                                id="category"
                                                data-testid="category-input"
                                                placeholder="e.g., Development"
                                                value={taskForm.category}
                                                onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                                className="rounded-xl"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <Button
                                            data-testid="create-task-submit"
                                            type="submit"
                                            disabled={createLoading}
                                            className="rounded-full flex-1"
                                        >
                                            {createLoading ? 'Creating...' : 'Create Task'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setShowCreateModal(false)}
                                            className="rounded-full"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                        <Button
                            data-testid="logout-button"
                            variant="outline"
                            onClick={logout}
                            className="rounded-full"
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            Logout
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content - 3 Column Layout */}
            <main className="container mx-auto px-6 py-8">
                {/* Task Limit Warning */}
                {dashboard?.task_limit_reached && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl flex items-center justify-between"
                    >
                        <div>
                            <p className="font-semibold text-amber-900">Free Tier Limit Reached</p>
                            <p className="text-sm text-amber-700">You have {dashboard.counts.active_tasks} active tasks. Upgrade to Pro for unlimited tasks.</p>
                        </div>
                        <Button onClick={() => navigate('/settings')} className="rounded-full">
                            Upgrade to Pro
                        </Button>
                    </motion.div>
                )}

                {/* 3-Column Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Column 1: Assigned to Me */}
                    <div>
                        <Card className="rounded-2xl border-l-4 border-indigo-500 bg-white/50 backdrop-blur-sm shadow-soft">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center justify-between" style={{ fontFamily: 'Outfit' }}>
                                    <span>Assigned to Me</span>
                                    <Badge variant="secondary" className="rounded-full">{dashboard?.counts.assigned_to_me || 0}</Badge>
                                </CardTitle>
                                <CardDescription>Tasks others assigned to you</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.assigned_to_me.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No tasks assigned</p>
                                ) : (
                                    dashboard?.assigned_to_me.map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} onQuickComplete={handleQuickComplete} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Column 2: My Focus (Self-Assigned) */}
                    <div>
                        <Card className="rounded-2xl border-l-4 border-emerald-500 bg-white/50 backdrop-blur-sm shadow-soft">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center justify-between" style={{ fontFamily: 'Outfit' }}>
                                    <span>My Focus</span>
                                    <Badge variant="secondary" className="rounded-full">{dashboard?.counts.self_assigned || 0}</Badge>
                                </CardTitle>
                                <CardDescription>Tasks you assigned to yourself</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.self_assigned.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No self-assigned tasks</p>
                                ) : (
                                    dashboard?.self_assigned.map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} onQuickComplete={handleQuickComplete} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Column 3: Delegated (Assigned by Me) */}
                    <div>
                        <Card className="rounded-2xl border-l-4 border-amber-500 bg-white/50 backdrop-blur-sm shadow-soft">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center justify-between" style={{ fontFamily: 'Outfit' }}>
                                    <span>Delegated</span>
                                    <Badge variant="secondary" className="rounded-full">{dashboard?.counts.assigned_by_me || 0}</Badge>
                                </CardTitle>
                                <CardDescription>Tasks you assigned to others</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.assigned_by_me.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-8">No delegated tasks</p>
                                ) : (
                                    dashboard?.assigned_by_me.map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} showAssignedTo={true} onQuickComplete={handleQuickComplete} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default TaskHub;