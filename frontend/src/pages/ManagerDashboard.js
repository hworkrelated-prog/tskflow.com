import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Clock, CheckCircle, AlertCircle, Calendar, LogOut } from 'lucide-react';
import { format } from 'date-fns';

const ManagerDashboard = () => {
    const { user, logout } = useAuth();
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            const response = await axios.get(`${API}/dashboard/manager`);
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

    const getPriorityClass = (priority) => {
        const map = { 'High': 'priority-high', 'Medium': 'priority-medium', 'Low': 'priority-low' };
        return map[priority] || '';
    };

    const TaskCard = ({ task }) => (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
        >
            <Card
                data-testid={`task-card-${task.id}`}
                className="border shadow-sm rounded-sm cursor-pointer task-card-hover"
                onClick={() => navigate(`/task/${task.id}`)}
            >
                <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-lg">{task.title}</h3>
                        {getStatusBadge(task.status)}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{task.description}</p>
                    <div className="flex items-center justify-between text-sm">
                        <span className={getPriorityClass(task.priority)}>{task.priority}</span>
                        <span className="text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(task.due_date), 'MMM dd, h:mm a')}
                        </span>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    return (
        <div data-testid="manager-dashboard" className="min-h-screen bg-white">
            {/* Header */}
            <header className="border-b bg-white">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>Manager Dashboard</h1>
                        <p className="text-sm text-muted-foreground">Welcome back, {user?.name}</p>
                    </div>
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
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-8">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="border-2 shadow-sm rounded-sm">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-md">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Due Today</p>
                                    <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{dashboard?.counts.due_today || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-2 shadow-sm rounded-sm">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-green-100 rounded-md">
                                    <CheckCircle className="w-6 h-6 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Completed Today</p>
                                    <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{dashboard?.counts.completed_today || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-2 shadow-sm rounded-sm">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-yellow-100 rounded-md">
                                    <AlertCircle className="w-6 h-6 text-yellow-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Pending Acceptance</p>
                                    <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{dashboard?.counts.pending_acceptance || 0}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Task Sections */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Overdue Tasks */}
                    <div className="lg:col-span-4">
                        <Card className="border-2 shadow-sm rounded-sm">
                            <CardHeader>
                                <CardTitle className="text-xl" style={{ fontFamily: 'Outfit' }}>Overdue Tasks</CardTitle>
                                <CardDescription>Tasks past due date</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.overdue_tasks.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No overdue tasks</p>
                                ) : (
                                    dashboard?.overdue_tasks.map((task) => <TaskCard key={task.id} task={task} />)
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Today's Tasks */}
                    <div className="lg:col-span-4">
                        <Card className="border-2 shadow-sm rounded-sm">
                            <CardHeader>
                                <CardTitle className="text-xl" style={{ fontFamily: 'Outfit' }}>Today's Tasks</CardTitle>
                                <CardDescription>Due today</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.today_tasks.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No tasks due today</p>
                                ) : (
                                    dashboard?.today_tasks.map((task) => <TaskCard key={task.id} task={task} />)
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Upcoming Tasks */}
                    <div className="lg:col-span-4">
                        <Card className="border-2 shadow-sm rounded-sm">
                            <CardHeader>
                                <CardTitle className="text-xl" style={{ fontFamily: 'Outfit' }}>Upcoming Tasks</CardTitle>
                                <CardDescription>Coming soon</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {dashboard?.upcoming_tasks.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No upcoming tasks</p>
                                ) : (
                                    dashboard?.upcoming_tasks.slice(0, 5).map((task) => <TaskCard key={task.id} task={task} />)
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ManagerDashboard;