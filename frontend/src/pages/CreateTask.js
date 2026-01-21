import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';

const CreateTask = () => {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        assigned_to: '',
        due_date: '',
        priority: 'Medium',
        category: ''
    });
    const navigate = useNavigate();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await axios.get(`${API}/users`);
            setUsers(response.data);
        } catch (error) {
            console.error('Failed to fetch users', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            await axios.post(`${API}/tasks`, formData);
            toast.success('Task created successfully');
            navigate('/dashboard');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create task'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="create-task-page" className="min-h-screen bg-white">
            {/* Header */}
            <header className="border-b bg-white">
                <div className="container mx-auto px-6 py-4">
                    <Button
                        data-testid="back-button"
                        variant="ghost"
                        onClick={() => navigate('/dashboard')}
                        className="mb-2 rounded-md"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                    <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>Create New Task</h1>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-8 max-w-2xl">
                <Card className="border-2 shadow-sm rounded-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Task Details</CardTitle>
                        <CardDescription>Fill in the information below to create a new task</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="title">Task Title</Label>
                                <Input
                                    id="title"
                                    data-testid="task-title-input"
                                    type="text"
                                    placeholder="Enter task title"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    required
                                    className="rounded-md"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    data-testid="task-description-input"
                                    placeholder="Enter task description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    required
                                    rows={5}
                                    className="rounded-md"
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
                                            <SelectValue placeholder="Select manager" />
                                        </SelectTrigger>
                                        <SelectContent>
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