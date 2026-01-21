import React, { useState, useEffect, useRef } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, LogOut, BarChart3, Settings, HelpCircle, Crown, X, Users, User } from 'lucide-react';
import TaskCard from '@/components/TaskCard';
import { motion, AnimatePresence } from 'framer-motion';
import { getErrorMessage } from '@/lib/utils';

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
        due_date: '',
        priority: 'Medium',
        category: ''
    });
    // Multi-select state
    const [selectedAssignees, setSelectedAssignees] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboard();
        fetchUsers();
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowUserDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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

    // Add assignee to selection
    const addAssignee = (assignee) => {
        // assignee can be {type: 'user', id, name, email} or {type: 'email', email} or {type: 'self'}
        const exists = selectedAssignees.some(a => 
            (a.type === 'user' && assignee.type === 'user' && a.id === assignee.id) ||
            (a.type === 'email' && assignee.type === 'email' && a.email === assignee.email) ||
            (a.type === 'self' && assignee.type === 'self')
        );
        if (!exists) {
            setSelectedAssignees([...selectedAssignees, assignee]);
        }
        setShowUserDropdown(false);
        setEmailInput('');
    };

    // Remove assignee from selection
    const removeAssignee = (index) => {
        setSelectedAssignees(selectedAssignees.filter((_, i) => i !== index));
    };

    // Handle email input
    const handleEmailKeyDown = (e) => {
        if (e.key === 'Enter' && emailInput.trim()) {
            e.preventDefault();
            if (emailInput.includes('@')) {
                // Check if it's an existing user
                const existingUser = users.find(u => u.email.toLowerCase() === emailInput.toLowerCase());
                if (existingUser) {
                    addAssignee({ type: 'user', id: existingUser.id, name: existingUser.name, email: existingUser.email });
                } else {
                    addAssignee({ type: 'email', email: emailInput.trim() });
                }
            } else {
                toast.error('Please enter a valid email address');
            }
        }
    };

    // Toggle user selection
    const toggleUserSelection = (userObj) => {
        const exists = selectedAssignees.some(a => a.type === 'user' && a.id === userObj.id);
        if (exists) {
            setSelectedAssignees(selectedAssignees.filter(a => !(a.type === 'user' && a.id === userObj.id)));
        } else {
            addAssignee({ type: 'user', id: userObj.id, name: userObj.name, email: userObj.email });
        }
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        
        if (selectedAssignees.length === 0) {
            toast.error('Please select at least one assignee');
            return;
        }

        if (dashboard?.task_limit_reached && selectedAssignees.length > 0) {
            toast.error('Free tier limit reached. Upgrade to Pro for unlimited tasks!');
            return;
        }

        setCreateLoading(true);
        try {
            // Convert selectedAssignees to list of IDs/emails
            const assigneeList = selectedAssignees.map(a => {
                if (a.type === 'self') return 'self';
                if (a.type === 'user') return a.id;
                if (a.type === 'email') return a.email;
                return null;
            }).filter(Boolean);

            if (assigneeList.length === 1) {
                // Single assignee - use regular endpoint
                await axios.post(`${API}/tasks`, {
                    ...taskForm,
                    assigned_to: assigneeList[0]
                });
                toast.success('Task created successfully!');
            } else {
                // Multiple assignees - use bulk endpoint
                await axios.post(`${API}/tasks/bulk`, {
                    ...taskForm,
                    assigned_to: assigneeList
                });
                toast.success(`${assigneeList.length} tasks created successfully!`);
            }

            setShowCreateModal(false);
            setTaskForm({
                title: '',
                description: '',
                due_date: '',
                priority: 'Medium',
                category: ''
            });
            setSelectedAssignees([]);
            fetchDashboard();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create task'));
        } finally {
            setCreateLoading(false);
        }
    };

    // Reset form when modal closes
    const handleModalChange = (open) => {
        setShowCreateModal(open);
        if (!open) {
            setSelectedAssignees([]);
            setEmailInput('');
            setTaskForm({
                title: '',
                description: '',
                due_date: '',
                priority: 'Medium',
                category: ''
            });
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
                            <Badge className="bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1">
                                <Crown className="w-3 h-3" />
                                PRO
                            </Badge>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            data-testid="analytics-button"
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/analytics')}
                            className="rounded-full"
                        >
                            <BarChart3 className="w-5 h-5" />
                        </Button>
                        <Button
                            data-testid="settings-button"
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/settings')}
                            className="rounded-full"
                        >
                            <Settings className="w-5 h-5" />
                        </Button>
                        <Button
                            data-testid="logout-button"
                            variant="ghost"
                            size="icon"
                            onClick={logout}
                            className="rounded-full"
                        >
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>Welcome, {user?.name}</h2>
                        <p className="text-muted-foreground">Manage your tasks and stay productive</p>
                    </div>
                    <Dialog open={showCreateModal} onOpenChange={handleModalChange}>
                        <DialogTrigger asChild>
                            <Button
                                data-testid="create-task-button"
                                className="rounded-full gap-2"
                                disabled={dashboard?.task_limit_reached}
                            >
                                <Plus className="w-4 h-4" />
                                New Task
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="rounded-2xl max-w-xl">
                            <DialogHeader>
                                <DialogTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Create Task</DialogTitle>
                                <DialogDescription>
                                    Assign to one or multiple people at once
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateTask} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="title">Task Title</Label>
                                    <Input
                                        id="title"
                                        data-testid="task-title-input"
                                        value={taskForm.title}
                                        onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                                        placeholder="Enter task title"
                                        required
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        data-testid="task-description-input"
                                        value={taskForm.description}
                                        onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                                        placeholder="Describe the task..."
                                        required
                                        rows={3}
                                        className="rounded-xl"
                                    />
                                </div>

                                {/* Multi-Select Assignees Section */}
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <Users className="w-4 h-4" />
                                        Assign To
                                    </Label>
                                    
                                    {/* Selected Assignees Pills */}
                                    {selectedAssignees.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            <AnimatePresence>
                                                {selectedAssignees.map((assignee, index) => (
                                                    <motion.div
                                                        key={`${assignee.type}-${assignee.id || assignee.email || 'self'}`}
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                        className="flex items-center gap-1 bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-full text-sm"
                                                    >
                                                        {assignee.type === 'self' ? (
                                                            <>
                                                                <User className="w-3 h-3" />
                                                                Me (Self)
                                                            </>
                                                        ) : assignee.type === 'user' ? (
                                                            <span>{assignee.name}</span>
                                                        ) : (
                                                            <span>{assignee.email}</span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => removeAssignee(index)}
                                                            className="ml-1 hover:bg-indigo-200 rounded-full p-0.5"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    )}

                                    {/* User Selection Dropdown */}
                                    <div className="relative" ref={dropdownRef}>
                                        <Input
                                            placeholder="Type email or click to select team members..."
                                            value={emailInput}
                                            onChange={(e) => setEmailInput(e.target.value)}
                                            onFocus={() => setShowUserDropdown(true)}
                                            onKeyDown={handleEmailKeyDown}
                                            className="rounded-xl"
                                        />
                                        
                                        {showUserDropdown && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-64 overflow-y-auto">
                                                {/* Self option */}
                                                {!selectedAssignees.some(a => a.type === 'self') && (
                                                    <div
                                                        onClick={() => addAssignee({ type: 'self' })}
                                                        className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b"
                                                    >
                                                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                                            <User className="w-4 h-4 text-indigo-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">Assign to Self</p>
                                                            <p className="text-xs text-muted-foreground">Auto-accept this task</p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Team members */}
                                                {users.filter(u => u.id !== user?.id).length > 0 && (
                                                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-gray-50">
                                                        Team Members
                                                    </div>
                                                )}
                                                {users
                                                    .filter(u => u.id !== user?.id)
                                                    .filter(u => !emailInput || u.name.toLowerCase().includes(emailInput.toLowerCase()) || u.email.toLowerCase().includes(emailInput.toLowerCase()))
                                                    .map((u) => {
                                                        const isSelected = selectedAssignees.some(a => a.type === 'user' && a.id === u.id);
                                                        return (
                                                            <div
                                                                key={u.id}
                                                                onClick={() => toggleUserSelection(u)}
                                                                className={`flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 cursor-pointer ${isSelected ? 'bg-indigo-50' : ''}`}
                                                            >
                                                                <Checkbox checked={isSelected} className="pointer-events-none" />
                                                                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                                                    <span className="text-sm font-medium">{u.name.charAt(0)}</span>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-medium truncate">{u.name}</p>
                                                                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                {/* Email hint */}
                                                {emailInput && emailInput.includes('@') && (
                                                    <div
                                                        onClick={() => {
                                                            const existingUser = users.find(u => u.email.toLowerCase() === emailInput.toLowerCase());
                                                            if (existingUser) {
                                                                addAssignee({ type: 'user', id: existingUser.id, name: existingUser.name, email: existingUser.email });
                                                            } else {
                                                                addAssignee({ type: 'email', email: emailInput.trim() });
                                                            }
                                                        }}
                                                        className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 cursor-pointer border-t"
                                                    >
                                                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                                            <Plus className="w-4 h-4 text-green-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">Invite "{emailInput}"</p>
                                                            <p className="text-xs text-muted-foreground">Send task via email</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Select multiple team members or type any email. Press Enter to add email.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
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
                                                <SelectItem value="Urgent">Urgent</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
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
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="category">Category (Optional)</Label>
                                    <Input
                                        id="category"
                                        data-testid="category-input"
                                        value={taskForm.category}
                                        onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                                        placeholder="e.g., Marketing, Development, Sales"
                                        className="rounded-xl"
                                    />
                                </div>
                                <Button
                                    data-testid="submit-task-button"
                                    type="submit"
                                    className="w-full rounded-full"
                                    disabled={createLoading || selectedAssignees.length === 0}
                                >
                                    {createLoading ? 'Creating...' : selectedAssignees.length > 1 ? `Create ${selectedAssignees.length} Tasks` : 'Create Task'}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {dashboard?.task_limit_reached && (
                    <Card className="mb-6 border-amber-200 bg-amber-50 rounded-2xl">
                        <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <HelpCircle className="w-5 h-5 text-amber-600" />
                                    <p className="text-amber-800">You've reached the free tier limit of 5 active tasks.</p>
                                </div>
                                <Button
                                    onClick={() => navigate('/settings')}
                                    className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600"
                                >
                                    <Crown className="w-4 h-4 mr-2" />
                                    Upgrade to Pro
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Task Columns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Assigned to Me */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Card className="border-2 shadow-soft rounded-2xl h-full">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                    Assigned to Me
                                </CardTitle>
                                <CardDescription>Tasks from others</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.assigned_to_me?.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">No tasks assigned to you</p>
                                ) : (
                                    dashboard?.assigned_to_me?.map((task, index) => (
                                        <motion.div
                                            key={task.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.2, delay: index * 0.05 }}
                                        >
                                            <TaskCard
                                                task={task}
                                                onClick={() => navigate(`/task/${task.id}`)}
                                                onComplete={task.status === 'Accepted' ? () => handleQuickComplete(task.id) : null}
                                            />
                                        </motion.div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Self-Assigned */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                    >
                        <Card className="border-2 shadow-soft rounded-2xl h-full">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                    Self-Assigned
                                </CardTitle>
                                <CardDescription>Your personal tasks</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.self_assigned?.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">No self-assigned tasks</p>
                                ) : (
                                    dashboard?.self_assigned?.map((task, index) => (
                                        <motion.div
                                            key={task.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.2, delay: index * 0.05 }}
                                        >
                                            <TaskCard
                                                task={task}
                                                onClick={() => navigate(`/task/${task.id}`)}
                                                onComplete={task.status === 'Accepted' ? () => handleQuickComplete(task.id) : null}
                                            />
                                        </motion.div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Delegated */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                    >
                        <Card className="border-2 shadow-soft rounded-2xl h-full">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                    Delegated
                                </CardTitle>
                                <CardDescription>Tasks you assigned</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.assigned_by_me?.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">No delegated tasks</p>
                                ) : (
                                    dashboard?.assigned_by_me?.map((task, index) => (
                                        <motion.div
                                            key={task.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.2, delay: index * 0.05 }}
                                        >
                                            <TaskCard
                                                task={task}
                                                onClick={() => navigate(`/task/${task.id}`)}
                                                showAssignee
                                            />
                                        </motion.div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </main>
        </div>
    );
};

export default TaskHub;
