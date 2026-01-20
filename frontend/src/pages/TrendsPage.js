import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO, startOfDay, subDays } from 'date-fns';

const TrendsPage = () => {
    const { user } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            const response = await axios.get(`${API}/tasks`);
            setTasks(response.data);
            processChartData(response.data);
        } catch (error) {
            console.error('Failed to fetch tasks', error);
        } finally {
            setLoading(false);
        }
    };

    const processChartData = (tasks) => {
        // Get last 30 days
        const days = [];
        for (let i = 29; i >= 0; i--) {
            const date = startOfDay(subDays(new Date(), i));
            days.push({
                date: format(date, 'MMM dd'),
                completed: 0,
                avgCompletionTime: 0,
                count: 0
            });
        }

        // Process completed tasks
        const completedTasks = tasks.filter(t => t.status === 'Completed' && t.completed_at);
        
        completedTasks.forEach(task => {
            const completedDate = startOfDay(parseISO(task.completed_at));
            const dayIndex = days.findIndex(d => d.date === format(completedDate, 'MMM dd'));
            
            if (dayIndex >= 0) {
                days[dayIndex].completed += 1;
                
                // Calculate completion time if accepted_at exists
                if (task.accepted_at) {
                    const acceptedTime = parseISO(task.accepted_at);
                    const completedTime = parseISO(task.completed_at);
                    const hours = (completedTime - acceptedTime) / (1000 * 60 * 60);
                    days[dayIndex].avgCompletionTime += hours;
                    days[dayIndex].count += 1;
                }
            }
        });

        // Calculate averages
        days.forEach(day => {
            if (day.count > 0) {
                day.avgCompletionTime = Math.round(day.avgCompletionTime / day.count);
            }
        });

        setChartData(days);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    const completedTasks = tasks.filter(t => t.status === 'Completed');
    const totalCompletionTimes = completedTasks
        .filter(t => t.accepted_at && t.completed_at)
        .map(t => {
            const accepted = parseISO(t.accepted_at);
            const completed = parseISO(t.completed_at);
            return (completed - accepted) / (1000 * 60 * 60);
        });
    const avgCompletionTime = totalCompletionTimes.length > 0
        ? (totalCompletionTimes.reduce((a, b) => a + b, 0) / totalCompletionTimes.length).toFixed(1)
        : 0;

    return (
        <div data-testid="trends-page" className="min-h-screen bg-white">
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
                    <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>Trends & Insights</h1>
                    <p className="text-sm text-muted-foreground">Task completion trends over time</p>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-8">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="border-2 shadow-sm rounded-sm">
                        <CardContent className="p-6">
                            <p className="text-sm text-muted-foreground mb-1">Total Completed</p>
                            <p className="text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>{completedTasks.length}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-2 shadow-sm rounded-sm">
                        <CardContent className="p-6">
                            <p className="text-sm text-muted-foreground mb-1">Avg Completion Time</p>
                            <p className="text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>{avgCompletionTime} hrs</p>
                        </CardContent>
                    </Card>
                    <Card className="border-2 shadow-sm rounded-sm">
                        <CardContent className="p-6">
                            <p className="text-sm text-muted-foreground mb-1">Completion Rate</p>
                            <p className="text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>
                                {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Chart */}
                <Card className="border-2 shadow-sm rounded-sm">
                    <CardHeader>
                        <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Task Completion Trend</CardTitle>
                        <CardDescription>Daily completed tasks over the last 30 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 12 }}
                                        stroke="#71717a"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 12 }}
                                        stroke="#71717a"
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#ffffff',
                                            border: '1px solid #e4e4e7',
                                            borderRadius: '4px'
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="completed"
                                        stroke="#18181b"
                                        strokeWidth={2}
                                        dot={{ fill: '#18181b', r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Completion Time Chart */}
                <Card className="border-2 shadow-sm rounded-sm mt-8">
                    <CardHeader>
                        <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Average Completion Time</CardTitle>
                        <CardDescription>Average hours to complete tasks over the last 30 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData.filter(d => d.count > 0)}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 12 }}
                                        stroke="#71717a"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 12 }}
                                        stroke="#71717a"
                                        label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#ffffff',
                                            border: '1px solid #e4e4e7',
                                            borderRadius: '4px'
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="avgCompletionTime"
                                        stroke="#71717a"
                                        strokeWidth={2}
                                        dot={{ fill: '#71717a', r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default TrendsPage;