import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Plus, Users, CheckCircle, AlertCircle, TrendingUp, LogOut } from 'lucide-react';
import { format } from 'date-fns';

const AdminDashboard = () => {
    const { user, logout } = useAuth();
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            const response = await axios.get(`${API}/dashboard/admin`);
            setDashboard(response.data);
        } catch (error) {
            console.error('Failed to fetch dashboard', error);
        } finally {
            setLoading(false);
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
            <Badge className={`${className} rounded-full px-2.5 py-0.5 text-xs font-semibold`}>
                {label}
            </Badge>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    return (
        <div data-testid="admin-dashboard" className="min-h-screen bg-white">
            {/* Header */}
            <header className="border-b bg-white">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>Admin Dashboard</h1>
                        <p className="text-sm text-muted-foreground">Welcome, {user?.name}</p>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            data-testid="create-task-button"
                            onClick={() => navigate('/admin/create-task')}
                            className="rounded-md font-medium"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Create Task
                        </Button>
                        <Button
                            data-testid="logout-button"
                            variant="outline"
                            onClick={logout}
                            className="rounded-md"
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            Logout
                        </Button>
                    </div>
                </div>
            </header>

            {/* Quick Navigation */}
            <div className="border-b bg-secondary/30">
                <div className="container mx-auto px-6 py-3 flex gap-4">
                    <Button
                        variant="ghost"
                        onClick={() => navigate('/dashboard')}
                        className="rounded-md text-sm"
                    >
                        Overview
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => navigate('/admin/performance')}
                        className="rounded-md text-sm"
                    >
                        <Users className="w-4 h-4 mr-2" />
                        Performance
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => navigate('/admin/trends')}
                        className="rounded-md text-sm"
                    >
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Trends
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-8">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                    >
                        <Card className="border-2 shadow-sm rounded-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-primary/10 rounded-md">
                                        <CheckCircle className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Total Tasks</p>
                                        <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{dashboard?.total_tasks || 0}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                    >
                        <Card className="border-2 shadow-sm rounded-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-green-100 rounded-md">
                                        <CheckCircle className="w-6 h-6 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Completed Today</p>
                                        <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{dashboard?.completed_today || 0}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                    >
                        <Card className="border-2 shadow-sm rounded-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-red-100 rounded-md">
                                        <AlertCircle className="w-6 h-6 text-red-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Overdue</p>
                                        <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{dashboard?.overdue_tasks || 0}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.4 }}
                    >
                        <Card className="border-2 shadow-sm rounded-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-blue-100 rounded-md">
                                        <TrendingUp className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Acceptance Rate</p>
                                        <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{dashboard?.acceptance_rate || 0}%</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Recent Tasks */}
                <Card className="border-2 shadow-sm rounded-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Recent Tasks</CardTitle>
                        <CardDescription>Latest task assignments</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {dashboard?.recent_tasks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No tasks yet</p>
                        ) : (
                            <div className="space-y-3">
                                {dashboard?.recent_tasks.map((task, index) => (
                                    <motion.div
                                        key={task.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.2, delay: index * 0.05 }}
                                    >
                                        <Card
                                            data-testid={`recent-task-${task.id}`}
                                            className="border shadow-sm rounded-sm cursor-pointer task-card-hover"
                                            onClick={() => navigate(`/task/${task.id}`)}
                                        >
                                            <CardContent className="p-4">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex-1">
                                                        <h3 className="font-semibold text-base">{task.title}</h3>
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            Assigned to: <span className="font-medium">{task.assigned_to_name}</span>
                                                        </p>
                                                    </div>
                                                    {getStatusBadge(task.status)}
                                                </div>
                                                <div className="flex items-center justify-between text-sm mt-2">
                                                    <span className="text-muted-foreground">Priority: <span className="font-medium">{task.priority}</span></span>
                                                    <span className="text-muted-foreground">
                                                        Due: {format(new Date(task.due_date), 'MMM dd, h:mm a')}
                                                    </span>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default AdminDashboard;