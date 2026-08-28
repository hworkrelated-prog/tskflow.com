import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import RichTextEditor from '@/components/RichTextEditor';

const CreateTask = () => {
    const { user } = useAuth();
    const location = useLocation();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [draftId, setDraftId] = useState(null);
    const [autoSaveStatus, setAutoSaveStatus] = useState('');
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        assigned_to: '',
        due_date: '',
        priority: 'Medium',
        category: '',
        auto_reminder: false,
        requires_screen_recording: false
    });
    const navigate = useNavigate();

    useEffect(() => {
        fetchUsers();
        
        // Check if resuming a draft
        if (location.state?.draftId) {
            loadDraft(location.state.draftId);
        }
    }, [location.state]);

    // Auto-save draft when user starts typing
    useEffect(() => {
        if (!draftId && formData.title) {
            // Create initial draft when user starts typing
            createDraft();
        } else if (draftId) {
            // Auto-save every 3 seconds after changes
            const timer = setTimeout(() => {
                saveDraft();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [formData]);

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`${API}/users`);
            setUsers(response.data);
        } catch (error) {
            console.error('Failed to fetch users', error);
        }
    };

    const loadDraft = async (id) => {
        try {
            const response = await axios.get(`${API}/tasks/${id}`);
            const draft = response.data;
            setDraftId(id);
            setFormData({
                title: draft.title || '',
                description: draft.description || '',
                assigned_to: draft.assigned_to || '',
                due_date: draft.due_date || '',
                priority: draft.priority || 'Medium',
                category: draft.category || '',
                auto_reminder: draft.auto_reminder || false
            });
            toast.success('Draft loaded');
        } catch (error) {
            toast.error('Failed to load draft');
        }
    };

    const createDraft = async () => {
        try {
            setAutoSaveStatus('Saving draft...');
            const response = await axios.post(`${API}/tasks/drafts`, formData);
            setDraftId(response.data.id);
            setAutoSaveStatus('Draft saved');
            setTimeout(() => setAutoSaveStatus(''), 2000);
        } catch (error) {
            console.error('Failed to create draft', error);
            setAutoSaveStatus('');
        }
    };

    const saveDraft = async () => {
        if (!draftId) return;
        
        try {
            setAutoSaveStatus('Saving...');
            await axios.put(`${API}/tasks/drafts/${draftId}`, formData);
            setAutoSaveStatus('Saved');
            setTimeout(() => setAutoSaveStatus(''), 2000);
        } catch (error) {
            console.error('Failed to save draft', error);
            setAutoSaveStatus('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (draftId) {
                // Complete the draft
                await axios.post(`${API}/tasks/drafts/${draftId}/complete`);
            } else {
                // Create new task directly
                await axios.post(`${API}/tasks`, formData);
            }
            toast.success('Task created successfully');
            navigate('/dashboard');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create task'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="create-task-page" className="page-shell">
            {/* Header */}
            <header className="border-b bg-white">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Button
                                data-testid="back-button"
                                variant="ghost"
                                onClick={() => navigate('/dashboard')}
                                className="mb-2 rounded-md"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                            <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>
                                {draftId ? 'Resume Draft' : 'Create New Task'}
                            </h1>
                        </div>
                        {autoSaveStatus && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Save className="w-4 h-4" />
                                {autoSaveStatus}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-8 max-w-2xl">
                <Card className="border-2 shadow-sm rounded-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>New task</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="title">Title</Label>
                                <Input
                                    id="title"
                                    data-testid="task-title-input"
                                    type="text"
                                    placeholder="Title"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                    className="rounded-md"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description (optional)</Label>
                                <RichTextEditor
                                    value={formData.description}
                                    onChange={(value) => setFormData({ ...formData, description: value })}
                                    placeholder="What needs to happen"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="assigned_to">Assign To</Label>
                                    <Select
                                        value={formData.assigned_to}
                                        onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                                        required
                                    >
                                        <SelectTrigger data-testid="assign-to-select" className="rounded-md">
                                            <SelectValue placeholder="Select user" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="self">Myself</SelectItem>
                                            {users.map((u) => (
                                                <SelectItem key={u.id} value={u.id}>
                                                    {u.name} ({u.email})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="priority">Priority</Label>
                                    <Select
                                        value={formData.priority}
                                        onValueChange={(value) => setFormData({ ...formData, priority: value })}
                                    >
                                        <SelectTrigger data-testid="priority-select" className="rounded-md">
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
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="due_date">Due Date & Time</Label>
                                    <Input
                                        id="due_date"
                                        data-testid="due-date-input"
                                        type="datetime-local"
                                        value={formData.due_date}
                                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                        required
                                        className="rounded-md"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="category">Category (optional)</Label>
                                    <Input
                                        id="category"
                                        data-testid="category-input"
                                        type="text"
                                        placeholder="e.g., Development"
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="rounded-md"
                                    />
                                </div>
                            </div>

                            {(formData.priority === 'High' || formData.priority === 'Urgent') && (
                                <div className="flex items-center space-x-2 p-4 bg-amber-50 border border-amber-200 rounded-md">
                                    <Checkbox
                                        id="auto_reminder"
                                        checked={formData.auto_reminder}
                                        onCheckedChange={(checked) => setFormData({ ...formData, auto_reminder: checked })}
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <label
                                            htmlFor="auto_reminder"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            Enable auto-reminder
                                        </label>
                                        <p className="text-sm text-muted-foreground">
                                            Send automatic reminders for this high-priority task
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center space-x-2 p-4 bg-blue-50 border border-blue-200 rounded-md">
                                <Checkbox
                                    id="requires_screen_recording"
                                    checked={formData.requires_screen_recording}
                                    onCheckedChange={(checked) => setFormData({ ...formData, requires_screen_recording: checked })}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label
                                        htmlFor="requires_screen_recording"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Require screen recording proof
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                        Assignee must submit a screen recording when completing this task
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button
                                    data-testid="create-task-submit"
                                    type="submit"
                                    disabled={loading}
                                    className="rounded-md font-medium"
                                >
                                    {loading ? 'Creating...' : 'Create Task'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate('/dashboard')}
                                    className="rounded-md"
                                >
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default CreateTask;
