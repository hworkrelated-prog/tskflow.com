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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Plus, LogOut, BarChart3, Settings, HelpCircle, Crown, X, Users, User, Calendar, ChevronDown, AlertCircle, CheckCircle2, Trash2, MoreHorizontal, RotateCcw, Target, CheckSquare } from 'lucide-react';
import TaskCard from '@/components/TaskCard';
import { motion, AnimatePresence } from 'framer-motion';
import { getErrorMessage } from '@/lib/utils';
import OnboardingPopup, { useOnboarding } from '@/components/OnboardingPopup';
import DateTimePicker from '@/components/DateTimePicker';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths, isBefore, parseISO } from 'date-fns';

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
        priority: 'Medium'
    });
    const [selectedAssignees, setSelectedAssignees] = useState([]);
    const [emailInput, setEmailInput] = useState('');
    const [showUserDropdown, setShowUserDropdown] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // User groups (Pro & Teams)
    const [groups, setGroups] = useState([]);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupForm, setGroupForm] = useState({ name: '', emails: [] });
    const [groupEmailInput, setGroupEmailInput] = useState('');
    const [groupSaving, setGroupSaving] = useState(false);
    
    const { showOnboarding, closeOnboarding, reopenOnboarding } = useOnboarding('dashboard');

    const [viewMode, setViewMode] = useState('active');
    const [dateFilter, setDateFilter] = useState('all');
    const [customDateRange, setCustomDateRange] = useState({ from: null, to: null });
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showMoreFilters, setShowMoreFilters] = useState(false);

    // Multi-select delete state
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedTasks, setSelectedTasks] = useState(new Set());
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Recently deleted
    const [deletedTasks, setDeletedTasks] = useState([]);
    const [showDeleted, setShowDeleted] = useState(false);

    // Upgrade nudges
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeModalShown, setUpgradeModalShown] = useState(() => localStorage.getItem('upgradeModalShown') === 'true');

    const getActiveTaskCount = () => {
        if (!dashboard) return 0;
        return (dashboard.assigned_to_me?.length || 0) + (dashboard.self_assigned?.length || 0) + (dashboard.assigned_by_me?.length || 0);
    };

    const activeTaskCount = getActiveTaskCount();
    const isFreeUser = user?.subscription_tier === 'free';
    const showLightBanner = isFreeUser && activeTaskCount >= 10;
    const showPersistentBanner = isFreeUser && activeTaskCount >= 30;

    React.useEffect(() => {
        if (isFreeUser && activeTaskCount >= 20 && !upgradeModalShown) {
            setShowUpgradeModal(true);
            setUpgradeModalShown(true);
            localStorage.setItem('upgradeModalShown', 'true');
        }
    }, [activeTaskCount, isFreeUser, upgradeModalShown]);

    const getDateRange = (filter) => {
        const now = new Date();
        const today = startOfDay(now);
        
        switch (filter) {
            case 'today':
                return { from: format(today, "yyyy-MM-dd'T'00:00"), to: format(endOfDay(today), "yyyy-MM-dd'T'23:59") };
            case 'this_week':
                return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd'T'00:00"), to: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd'T'23:59") };
            case 'next_week':
                const nextWeekStart = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), 1);
                return { from: format(nextWeekStart, "yyyy-MM-dd'T'00:00"), to: format(endOfWeek(nextWeekStart, { weekStartsOn: 1 }), "yyyy-MM-dd'T'23:59") };
            case 'this_month':
                return { from: format(startOfMonth(today), "yyyy-MM-dd'T'00:00"), to: format(endOfMonth(today), "yyyy-MM-dd'T'23:59") };
            case 'next_month':
                const nextMonthStart = addMonths(startOfMonth(today), 1);
                return { from: format(nextMonthStart, "yyyy-MM-dd'T'00:00"), to: format(endOfMonth(nextMonthStart), "yyyy-MM-dd'T'23:59") };
            case 'custom':
                if (customDateRange.from && customDateRange.to) {
                    return { 
                        from: format(customDateRange.from, "yyyy-MM-dd'T'00:00"), 
                        to: format(customDateRange.to, "yyyy-MM-dd'T'23:59") 
                    };
                }
                return { from: null, to: null };
            default:
                return { from: null, to: null };
        }
    };

    useEffect(() => {
        fetchDashboard();
        fetchUsers();
        fetchDeletedTasks();
        fetchGroups();
    }, [viewMode, dateFilter, customDateRange]);

    // Auto-refresh polling with sound notification for new tasks
    const lastTaskCountRef = useRef(null);
    useEffect(() => {
        // Initialize count when dashboard loads
        if (dashboard && lastTaskCountRef.current === null) {
            lastTaskCountRef.current = (dashboard.assigned_to_me?.length || 0) + (dashboard.created_by_me?.length || 0);
        }
    }, [dashboard]);

    useEffect(() => {
        const playNotificationSound = () => {
            const audio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNbrMnAAAAAAD/+9DEAAAIAANIAAAAFZYhKjyigABMSTVu+d3vcQ/8+gMBjp0Bg+sEP/E4Pv/WCH/5cEwfWD7+oCYPv/Lg+//1g+/+D4f///E4Pg+D/8uCHBAMHQQAAAgAAAAA8PDw8PDw8A8QAHD4f1A+H9YPh//0B//qA//+AwAAJxyOBwOBgHwfAgAAACTP//5M///JM///km//+Sf/5Jv//JN//8k3//5Jv//ySb//5N//8m//+Tb//5N//8m3//yb//5N//8k3//yTf//JN//8m//+Sf/5Jv//km//+Sb//5Jv//JN//8k2//+Sb//5N//8m3//yb/');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        };

        const pollForNewTasks = async () => {
            try {
                const params = new URLSearchParams();
                params.append('status_filter', viewMode);
                const response = await axios.get(`${API}/dashboard?${params.toString()}`);
                const newData = response.data;
                
                const currentTotal = (newData.assigned_to_me?.length || 0) + (newData.created_by_me?.length || 0);
                
                if (lastTaskCountRef.current !== null && currentTotal > lastTaskCountRef.current) {
                    playNotificationSound();
                    toast.success('New task received!');
                    setDashboard(newData);
                }
                
                lastTaskCountRef.current = currentTotal;
            } catch (error) {
                // Silent fail for polling
            }
        };

        // Poll every 10 seconds
        const interval = setInterval(pollForNewTasks, 10000);
        return () => clearInterval(interval);
    }, [viewMode]);

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
            const params = new URLSearchParams();
            params.append('status_filter', viewMode);
            
            const dateRange = getDateRange(dateFilter);
            if (dateRange.from) params.append('date_from', dateRange.from);
            if (dateRange.to) params.append('date_to', dateRange.to);
            
            const response = await axios.get(`${API}/dashboard?${params.toString()}`);
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

    const fetchGroups = async () => {
        if (user?.subscription_tier === 'free') {
            setGroups([]);
            return;
        }
        try {
            const response = await axios.get(`${API}/groups`);
            setGroups(response.data);
        } catch (error) {
            // Silent: free users or no groups yet
        }
    };

    const addGroupEmail = () => {
        const email = groupEmailInput.trim().toLowerCase();
        if (!email || !email.includes('@')) {
            toast.error('Enter a valid email address');
            return;
        }
        if (groupForm.emails.includes(email)) {
            toast.error('Email already added to this group');
            setGroupEmailInput('');
            return;
        }
        setGroupForm({ ...groupForm, emails: [...groupForm.emails, email] });
        setGroupEmailInput('');
    };

    const handleSaveGroup = async () => {
        if (!groupForm.name.trim()) {
            toast.error('Please give your group a name');
            return;
        }
        if (groupForm.emails.length === 0) {
            toast.error('Add at least one email to the group');
            return;
        }
        setGroupSaving(true);
        try {
            await axios.post(`${API}/groups`, { name: groupForm.name.trim(), emails: groupForm.emails });
            toast.success(`Group "${groupForm.name.trim()}" created`);
            setGroupForm({ name: '', emails: [] });
            setGroupEmailInput('');
            fetchGroups();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create group'));
        } finally {
            setGroupSaving(false);
        }
    };

    const handleDeleteGroup = async (groupId) => {
        try {
            await axios.delete(`${API}/groups/${groupId}`);
            toast.success('Group deleted');
            fetchGroups();
        } catch (error) {
            toast.error('Failed to delete group');
        }
    };

    const applyGroup = (group) => {
        const newAssignees = [...selectedAssignees];
        let added = 0;
        group.emails.forEach((email) => {
            const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (existingUser) {
                const dup = newAssignees.some(a => a.type === 'user' && a.id === existingUser.id);
                if (!dup) {
                    newAssignees.push({ type: 'user', id: existingUser.id, name: existingUser.name, email: existingUser.email });
                    added++;
                }
            } else {
                const dup = newAssignees.some(a => a.type === 'email' && a.email === email);
                if (!dup) {
                    newAssignees.push({ type: 'email', email });
                    added++;
                }
            }
        });
        setSelectedAssignees(newAssignees);
        setShowUserDropdown(false);
        toast.success(`Added ${added} member(s) from "${group.name}"`);
    };

    const fetchDeletedTasks = async () => {
        try {
            const response = await axios.get(`${API}/tasks/deleted`);
            setDeletedTasks(response.data);
        } catch (error) {
            console.error('Failed to fetch deleted tasks');
        }
    };

    const handleRestoreTask = async (taskId) => {
        try {
            await axios.put(`${API}/tasks/${taskId}/restore`);
            toast.success('Task restored');
            fetchDashboard();
            fetchDeletedTasks();
        } catch (error) {
            toast.error('Failed to restore task');
        }
    };

    const handleQuickComplete = async (taskId, completionNote, completionImages) => {
        try {
            await axios.put(`${API}/tasks/${taskId}/complete`, {
                completion_note: completionNote,
                completion_note_images: completionImages
            });
            toast.success('Task submitted!');
            fetchDashboard();
        } catch (error) {
            toast.error('Failed to complete task');
        }
    };

    const filterOverdueTasks = (tasks) => {
        const now = new Date();
        return tasks.filter(task => {
            const dueDate = parseISO(task.due_date);
            return isBefore(dueDate, now) && task.status !== 'Completed';
        });
    };

    const getOverdueCount = () => {
        if (!dashboard) return 0;
        const allTasks = [...(dashboard.assigned_to_me || []), ...(dashboard.self_assigned || []), ...(dashboard.assigned_by_me || [])];
        return filterOverdueTasks(allTasks).length;
    };

    const toggleTaskSelection = (taskId) => {
        const newSelected = new Set(selectedTasks);
        if (newSelected.has(taskId)) {
            newSelected.delete(taskId);
        } else {
            newSelected.add(taskId);
        }
        setSelectedTasks(newSelected);
    };

    const handleBulkDelete = async () => {
        if (selectedTasks.size === 0) return;
        
        setDeleteLoading(true);
        try {
            await axios.post(`${API}/tasks/bulk-delete`, Array.from(selectedTasks));
            toast.success(`${selectedTasks.size} task(s) deleted`);
            setSelectedTasks(new Set());
            setSelectionMode(false);
            fetchDashboard();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to delete tasks'));
        } finally {
            setDeleteLoading(false);
        }
    };

    const cancelSelection = () => {
        setSelectionMode(false);
        setSelectedTasks(new Set());
    };

    const addAssignee = (assignee) => {
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

    const removeAssignee = (index) => {
        setSelectedAssignees(selectedAssignees.filter((_, i) => i !== index));
    };

    const handleEmailKeyDown = (e) => {
        if (e.key === 'Enter' && emailInput.trim()) {
            e.preventDefault();
            if (emailInput.includes('@')) {
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

        if (false) {
            toast.error('Free tier limit reached. Upgrade to Pro for unlimited tasks!');
            return;
        }

        setCreateLoading(true);
        try {
            const assigneeList = selectedAssignees.map(a => {
                if (a.type === 'self') return 'self';
                if (a.type === 'user') return a.id;
                if (a.type === 'email') return a.email;
                return null;
            }).filter(Boolean);

            const taskData = { ...taskForm };

            if (assigneeList.length === 1) {
                await axios.post(`${API}/tasks`, {
                    ...taskData,
                    assigned_to: assigneeList[0]
                });
                toast.success('Task created successfully!');
            } else {
                await axios.post(`${API}/tasks/bulk`, {
                    ...taskData,
                    assigned_to: assigneeList
                });
                toast.success(`${assigneeList.length} tasks created successfully!`);
            }

            setShowCreateModal(false);
            setTaskForm({
                title: '',
                description: '',
                due_date: '',
                priority: 'Medium'
            });
            setSelectedAssignees([]);
            fetchDashboard();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create task'));
        } finally {
            setCreateLoading(false);
        }
    };

    const handleModalChange = (open) => {
        setShowCreateModal(open);
        if (!open) {
            setSelectedAssignees([]);
            setEmailInput('');
            setTaskForm({
                title: '',
                description: '',
                due_date: '',
                priority: 'Medium'
            });
        }
    };

    const primaryFilters = [
        { value: 'overdue', label: 'Overdue', badge: true },
        { value: 'today', label: 'Today' },
        { value: 'this_week', label: 'This Week' }
    ];

    const moreFilters = [
        { value: 'next_week', label: 'Next Week' },
        { value: 'this_month', label: 'This Month' },
        { value: 'next_month', label: 'Next Month' },
        { value: 'custom', label: 'Custom Range' }
    ];

    const getFilteredTasks = (tasks) => {
        if (dateFilter !== 'overdue') return tasks;
        return filterOverdueTasks(tasks);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium">Loading your tasks...</div>
            </div>
        );
    }

    const overdueCount = getOverdueCount();

    return (
        <div data-testid="task-hub" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            <AnimatePresence>
                {showOnboarding && (
                    <OnboardingPopup page="dashboard" onClose={closeOnboarding} />
                )}
            </AnimatePresence>

            <header className="sticky top-0 z-50 glass-header border-b">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 onClick={() => navigate('/')} className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition-opacity" style={{ fontFamily: 'Outfit' }}>Tskflow</h1>
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
                        <Button variant="outline" size="icon" onClick={reopenOnboarding} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100" title="Help & Walkthrough">
                            <HelpCircle className="w-5 h-5" />
                        </Button>
                        {user?.subscription_tier === 'teams' && (
                            <Button data-testid="team-button" variant="outline" size="icon" onClick={() => navigate('/team')} className="rounded-full border-indigo-300 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title="Manage Team">
                                <Users className="w-5 h-5" />
                            </Button>
                        )}
                        <Button data-testid="prospecting-button" variant="outline" size="icon" onClick={() => navigate('/leads')} className="rounded-full border-indigo-300 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title="Prospecting (Sales leads)">
                            <Target className="w-5 h-5" />
                        </Button>
                        <Button data-testid="analytics-button" variant="outline" size="icon" onClick={() => navigate('/analytics')} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                            <BarChart3 className="w-5 h-5" />
                        </Button>
                        <Button data-testid="settings-button" variant="outline" size="icon" onClick={() => navigate('/settings')} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                            <Settings className="w-5 h-5" />
                        </Button>
                        <Button data-testid="logout-button" variant="outline" size="icon" onClick={logout} className="rounded-full border-gray-300 text-gray-600 hover:text-gray-900 hover:bg-gray-100">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>Welcome, {user?.name}</h2>
                        <p className="text-muted-foreground">Manage your tasks and stay productive</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectionMode ? (
                            <>
                                <span className="text-sm text-muted-foreground mr-2">{selectedTasks.size} selected</span>
                                <Button variant="outline" onClick={cancelSelection} className="rounded-full">Cancel</Button>
                                <Button variant="destructive" onClick={handleBulkDelete} disabled={selectedTasks.size === 0 || deleteLoading} className="rounded-full">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {deleteLoading ? 'Deleting...' : 'Delete'}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setSelectionMode(true)} className="rounded-full gap-2" data-testid="select-tasks-button">
                                    <CheckSquare className="w-4 h-4" />
                                    Select
                                </Button>
                                <Dialog open={showCreateModal} onOpenChange={handleModalChange}>
                                    <DialogTrigger asChild>
                                        <Button data-testid="create-task-button" className="rounded-full gap-2" disabled={false}>
                                            <Plus className="w-4 h-4" />
                                            New Task
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="rounded-2xl max-w-xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
                                        <DialogHeader>
                                            <DialogTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Create Task</DialogTitle>
                                            <DialogDescription>Assign to one or multiple people at once</DialogDescription>
                                        </DialogHeader>
                                        <form onSubmit={handleCreateTask} className="space-y-5">
                                            <div className="space-y-2">
                                                <Label htmlFor="title">Task Title</Label>
                                                <Input id="title" data-testid="task-title-input" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Enter task title" required className="rounded-xl" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="description">Description</Label>
                                                <Textarea id="description" data-testid="task-description-input" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Describe the task..." required rows={3} className="rounded-xl" />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Assign To</Label>
                                                    {!isFreeUser && (
                                                        <button type="button" data-testid="manage-groups-button" onClick={() => setShowGroupModal(true)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                                            <Users className="w-3.5 h-3.5" /> Manage groups
                                                        </button>
                                                    )}
                                                </div>
                                                {selectedAssignees.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        <AnimatePresence>
                                                            {selectedAssignees.map((assignee, index) => (
                                                                <motion.div key={`${assignee.type}-${assignee.id || assignee.email || 'self'}`} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-full text-sm">
                                                                    {assignee.type === 'self' ? (<><User className="w-3 h-3" />Me (Self)</>) : assignee.type === 'user' ? (<span>{assignee.name}</span>) : (<span>{assignee.email}</span>)}
                                                                    <button type="button" onClick={() => removeAssignee(index)} className="ml-1 hover:bg-indigo-200 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                                                                </motion.div>
                                                            ))}
                                                        </AnimatePresence>
                                                    </div>
                                                )}
                                                <div className="relative" ref={dropdownRef}>
                                                    <Input placeholder="Type email or click to select team members..." value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onFocus={() => setShowUserDropdown(true)} onKeyDown={handleEmailKeyDown} className="rounded-xl" />
                                                    {showUserDropdown && (
                                                        <div className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-64 overflow-y-auto">
                                                            {!selectedAssignees.some(a => a.type === 'self') && (
                                                                <div onClick={() => addAssignee({ type: 'self' })} className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b">
                                                                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center"><User className="w-4 h-4 text-indigo-600" /></div>
                                                                    <div><p className="font-medium">Assign to Self</p><p className="text-xs text-muted-foreground">Auto-accept this task</p></div>
                                                                </div>
                                                            )}
                                                            {!isFreeUser && groups.length > 0 && (
                                                                <>
                                                                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-gray-50">Your Groups</div>
                                                                    {groups.map((group) => (
                                                                        <div key={group.id} data-testid={`group-option-${group.id}`} onClick={() => applyGroup(group)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 cursor-pointer border-b">
                                                                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center"><Users className="w-4 h-4 text-purple-600" /></div>
                                                                            <div className="flex-1 min-w-0"><p className="font-medium truncate">{group.name}</p><p className="text-xs text-muted-foreground truncate">{group.emails.length} member(s)</p></div>
                                                                            <Plus className="w-4 h-4 text-indigo-500" />
                                                                        </div>
                                                                    ))}
                                                                </>
                                                            )}
                                                            {users.filter(u => u.id !== user?.id).length > 0 && (<div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-gray-50">Team Members</div>)}
                                                            {users.filter(u => u.id !== user?.id).filter(u => !emailInput || u.name.toLowerCase().includes(emailInput.toLowerCase()) || u.email.toLowerCase().includes(emailInput.toLowerCase())).map((u) => {
                                                                const isSelected = selectedAssignees.some(a => a.type === 'user' && a.id === u.id);
                                                                return (
                                                                    <div key={u.id} onClick={() => toggleUserSelection(u)} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50 cursor-pointer ${isSelected ? 'bg-indigo-50' : ''}`}>
                                                                        <Checkbox checked={isSelected} className="pointer-events-none" />
                                                                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center"><span className="text-sm font-medium">{u.name.charAt(0)}</span></div>
                                                                        <div className="flex-1 min-w-0"><p className="font-medium truncate">{u.name}</p><p className="text-xs text-muted-foreground truncate">{u.email}</p></div>
                                                                    </div>
                                                                );
                                                            })}
                                                            {emailInput && emailInput.includes('@') && (
                                                                <div onClick={() => { const existingUser = users.find(u => u.email.toLowerCase() === emailInput.toLowerCase()); if (existingUser) { addAssignee({ type: 'user', id: existingUser.id, name: existingUser.name, email: existingUser.email }); } else { addAssignee({ type: 'email', email: emailInput.trim() }); } }} className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 cursor-pointer border-t">
                                                                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center"><Plus className="w-4 h-4 text-green-600" /></div>
                                                                    <div><p className="font-medium">Invite "{emailInput}"</p><p className="text-xs text-muted-foreground">Send task via email</p></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground">Select multiple team members or type any email. Press Enter to add email.</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="priority">Priority</Label>
                                                    <Select value={taskForm.priority} onValueChange={(value) => setTaskForm({ ...taskForm, priority: value })}>
                                                        <SelectTrigger data-testid="priority-select" className="rounded-xl"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Low">Low</SelectItem>
                                                            <SelectItem value="Medium">Medium</SelectItem>
                                                            <SelectItem value="High">High</SelectItem>
                                                            <SelectItem value="Urgent">Urgent</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="due_date">Due Date & Time</Label>
                                                    <DateTimePicker
                                                        value={taskForm.due_date}
                                                        onChange={(val) => setTaskForm({ ...taskForm, due_date: val })}
                                                        testId="due-date"
                                                    />
                                                </div>
                                            </div>
                                            <Button data-testid="submit-task-button" type="submit" className="w-full rounded-full" disabled={createLoading || selectedAssignees.length === 0}>
                                                {createLoading ? 'Creating...' : selectedAssignees.length > 1 ? `Create ${selectedAssignees.length} Tasks` : 'Create Task'}
                                            </Button>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                                {!isFreeUser && (
                                    <Dialog open={showGroupModal} onOpenChange={setShowGroupModal}>
                                        <DialogContent className="rounded-2xl max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Your Groups</DialogTitle>
                                                <DialogDescription>Save a group of emails once, then assign to everyone in one click.</DialogDescription>
                                            </DialogHeader>

                                            {groups.length > 0 && (
                                                <div className="space-y-2 mb-4">
                                                    {groups.map((group) => (
                                                        <div key={group.id} data-testid={`group-row-${group.id}`} className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-slate-50">
                                                            <div className="min-w-0">
                                                                <p className="font-semibold truncate">{group.name}</p>
                                                                <p className="text-xs text-muted-foreground truncate">{group.emails.join(', ')}</p>
                                                            </div>
                                                            <button type="button" data-testid={`delete-group-${group.id}`} onClick={() => handleDeleteGroup(group.id)} className="text-red-500 hover:bg-red-50 rounded-full p-2 shrink-0">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="space-y-3 pt-2 border-t">
                                                <p className="text-sm font-semibold">Create a new group</p>
                                                <div className="space-y-2">
                                                    <Label htmlFor="group-name">Group name</Label>
                                                    <Input id="group-name" data-testid="group-name-input" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder='e.g., "My Team", "Design Squad"' className="rounded-xl" />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="group-email">Add members by email</Label>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            id="group-email"
                                                            data-testid="group-email-input"
                                                            value={groupEmailInput}
                                                            onChange={(e) => setGroupEmailInput(e.target.value)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGroupEmail(); } }}
                                                            placeholder="name@company.com"
                                                            className="rounded-xl"
                                                        />
                                                        <Button type="button" variant="outline" data-testid="add-group-email-button" onClick={addGroupEmail} className="rounded-xl shrink-0">Add</Button>
                                                    </div>
                                                    {groupForm.emails.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            {groupForm.emails.map((email) => (
                                                                <div key={email} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-full text-sm">
                                                                    <span>{email}</span>
                                                                    <button type="button" onClick={() => setGroupForm({ ...groupForm, emails: groupForm.emails.filter((em) => em !== email) })} className="ml-1 hover:bg-indigo-200 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <Button type="button" data-testid="save-group-button" onClick={handleSaveGroup} disabled={groupSaving} className="w-full rounded-full">
                                                    {groupSaving ? 'Saving...' : 'Create Group'}
                                                </Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div className="flex items-center bg-gray-100 rounded-full p-1">
                        <button data-testid="view-active-tasks" onClick={() => setViewMode('active')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'active' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}>Active Tasks</button>
                        <button data-testid="view-completed-tasks" onClick={() => setViewMode('completed')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'completed' ? 'bg-white shadow-sm text-green-600' : 'text-gray-600 hover:text-gray-900'}`}><CheckCircle2 className="w-4 h-4" />Completed</button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button data-testid="date-filter-all" onClick={() => setDateFilter('all')} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${dateFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-300'}`}>All</button>
                        
                        {primaryFilters.map((option) => (
                            <button key={option.value} data-testid={`date-filter-${option.value}`} onClick={() => setDateFilter(option.value)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${dateFilter === option.value ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-300'}`}>
                                {option.value === 'overdue' && <AlertCircle className="w-3.5 h-3.5" />}
                                {option.label}
                                {option.badge && overdueCount > 0 && viewMode === 'active' && (
                                    <span className={`px-1.5 py-0.5 text-xs rounded-full ${dateFilter === 'overdue' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'}`}>{overdueCount}</span>
                                )}
                            </button>
                        ))}
                        
                        <DropdownMenu open={showMoreFilters} onOpenChange={setShowMoreFilters}>
                            <DropdownMenuTrigger asChild>
                                <button data-testid="more-filters-button" className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${moreFilters.some(f => f.value === dateFilter) ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-300'}`}>
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                    More
                                    <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                                {moreFilters.map((option) => (
                                    option.value === 'custom' ? (
                                        <Popover key={option.value} open={showDatePicker} onOpenChange={setShowDatePicker}>
                                            <PopoverTrigger asChild>
                                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDateFilter('custom'); setShowDatePicker(true); }} className="cursor-pointer">
                                                    <Calendar className="w-4 h-4 mr-2" />
                                                    {dateFilter === 'custom' && customDateRange.from && customDateRange.to ? `${format(customDateRange.from, 'MMM d')} - ${format(customDateRange.to, 'MMM d')}` : 'Custom Range'}
                                                </DropdownMenuItem>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start" side="right">
                                                <CalendarComponent mode="range" selected={{ from: customDateRange.from, to: customDateRange.to }} onSelect={(range) => { setCustomDateRange({ from: range?.from || null, to: range?.to || null }); if (range?.from && range?.to) { setShowDatePicker(false); setShowMoreFilters(false); } }} numberOfMonths={2} className="rounded-xl" />
                                            </PopoverContent>
                                        </Popover>
                                    ) : (
                                        <DropdownMenuItem key={option.value} onClick={() => { setDateFilter(option.value); setShowMoreFilters(false); }} className={`cursor-pointer ${dateFilter === option.value ? 'bg-indigo-50 text-indigo-600' : ''}`}>
                                            {option.label}
                                        </DropdownMenuItem>
                                    )
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Upgrade Nudges */}
                {showLightBanner && !showPersistentBanner && (
                    <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                        <p className="text-sm text-indigo-800">You have {activeTaskCount} active tasks. Upgrade for advanced features!</p>
                        <Button size="sm" onClick={() => navigate('/settings')} className="rounded-full text-xs"><Crown className="w-3 h-3 mr-1" />Upgrade</Button>
                    </div>
                )}

                {showPersistentBanner && (
                    <Card className="mb-6 border-amber-200 bg-amber-50 rounded-2xl">
                        <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3"><Crown className="w-5 h-5 text-amber-600" /><p className="text-amber-800">You're managing {activeTaskCount} tasks! Upgrade to Pro or Teams for priority support and team features.</p></div>
                                <Button onClick={() => navigate('/settings')} className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600"><Crown className="w-4 h-4 mr-2" />Upgrade</Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Upgrade Modal (shown once at 20 tasks) */}
                <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
                    <DialogContent className="rounded-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-foreground">You're Growing Fast!</DialogTitle>
                            <DialogDescription>You now have {activeTaskCount} active tasks. Consider upgrading to Pro or Teams for team collaboration, analytics, and priority support.</DialogDescription>
                        </DialogHeader>
                        <div className="flex gap-2 justify-end pt-4">
                            <Button variant="outline" onClick={() => setShowUpgradeModal(false)} className="rounded-full">Maybe Later</Button>
                            <Button onClick={() => { setShowUpgradeModal(false); navigate('/settings'); }} className="rounded-full"><Crown className="w-4 h-4 mr-2" />View Plans</Button>
                        </div>
                    </DialogContent>
                </Dialog>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                        <Card className="border-2 shadow-soft rounded-2xl">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div>Assigned to Me</CardTitle>
                                <CardDescription>Tasks from others</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {getFilteredTasks(dashboard?.assigned_to_me || []).length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">{viewMode === 'completed' ? 'No completed tasks' : 'No tasks assigned to you'}</p>
                                ) : (
                                    getFilteredTasks(dashboard?.assigned_to_me || []).map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} onComplete={handleQuickComplete} selectionMode={selectionMode} selected={selectedTasks.has(task.id)} onSelect={toggleTaskSelection} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                        <Card className="border-2 shadow-soft rounded-2xl">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500"></div>Self-Assigned</CardTitle>
                                <CardDescription>Your personal tasks</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {getFilteredTasks(dashboard?.self_assigned || []).length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">{viewMode === 'completed' ? 'No completed tasks' : 'No self-assigned tasks'}</p>
                                ) : (
                                    getFilteredTasks(dashboard?.self_assigned || []).map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} onComplete={handleQuickComplete} selectionMode={selectionMode} selected={selectedTasks.has(task.id)} onSelect={toggleTaskSelection} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
                        <Card className="border-2 shadow-soft rounded-2xl">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg font-semibold flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div>Delegated</CardTitle>
                                <CardDescription>Tasks you assigned</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {getFilteredTasks(dashboard?.assigned_by_me || []).length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">{viewMode === 'completed' ? 'No completed tasks' : 'No delegated tasks'}</p>
                                ) : (
                                    getFilteredTasks(dashboard?.assigned_by_me || []).map((task, index) => (
                                        <TaskCard key={task.id} task={task} index={index} showAssignee selectionMode={selectionMode} selected={selectedTasks.has(task.id)} onSelect={toggleTaskSelection} />
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Recently Deleted Section */}
                {deletedTasks.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
                        <button onClick={() => setShowDeleted(!showDeleted)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
                            <Trash2 className="w-4 h-4" />
                            <span className="font-medium">Recently Deleted ({deletedTasks.length})</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${showDeleted ? 'rotate-180' : ''}`} />
                        </button>
                        {showDeleted && (
                            <Card className="border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50/50">
                                <CardContent className="p-4">
                                    <p className="text-xs text-muted-foreground mb-3">Tasks are permanently deleted after 3 days</p>
                                    <div className="space-y-2">
                                        {deletedTasks.map((task) => (
                                            <div key={task.id} className="flex items-center justify-between p-3 bg-white rounded-xl border">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate text-gray-600">{task.title}</p>
                                                    <p className="text-xs text-muted-foreground">Deleted {task.deleted_at ? format(parseISO(task.deleted_at), 'MMM d, h:mm a') : 'recently'}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={() => handleRestoreTask(task.id)} className="rounded-full">
                                                    <RotateCcw className="w-4 h-4 mr-1" />
                                                    Restore
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </motion.div>
                )}
            </main>
        </div>
    );
};

export default TaskHub;
