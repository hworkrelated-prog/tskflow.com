import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, BarChart2, Users, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

const AnalyticsPage = () => {
    const { user } = useAuth();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleFetchAnalytics = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API}/analytics`, {
                start_date: startDate,
                end_date: endDate
            });
            setAnalytics(response.data);
        } catch (error) {
            toast.error('Failed to fetch analytics');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="analytics-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            <header className="glass-header border-b">
                <div className="container mx-auto px-6 py-4">
                    <Button
                        data-testid="back-button"
                        variant="ghost"
                        onClick={() => navigate('/dashboard')}
                        className="rounded-full"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Hub
                    </Button>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 max-w-6xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-8"
                >
                    <div className="text-center">
                        <h1 className="text-5xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>Analytics</h1>
                        <p className="text-muted-foreground text-lg">Track your task management patterns</p>
                    </div>

                    <Card className="border-2 shadow-soft rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Select Time Period</CardTitle>
                            <CardDescription>Choose a date range to analyze</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleFetchAnalytics} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="startDate">Start Date</Label>
                                        <Input
                                            id="startDate"
                                            data-testid="start-date-input"
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            required
                                            className="rounded-xl h-12"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="endDate">End Date</Label>
                                        <Input
                                            id="endDate"
                                            data-testid="end-date-input"
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            required
                                            className="rounded-xl h-12"
                                        />
                                    </div>
                                </div>
                                <Button
                                    data-testid="fetch-analytics-button"
                                    type="submit"
                                    disabled={loading}
                                    className="w-full rounded-full h-12"
                                >
                                    {loading ? 'Loading...' : 'Get Analytics'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {analytics && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-indigo-100 rounded-xl">
                                                <Users className="w-6 h-6 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Assigned to Others</p>
                                                <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{analytics.assigned_to_others_count}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-emerald-100 rounded-xl">
                                                <Calendar className="w-6 h-6 text-emerald-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Self-Assigned</p>
                                                <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{analytics.assigned_to_self_count}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-amber-100 rounded-xl">
                                                <BarChart2 className="w-6 h-6 text-amber-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Received</p>
                                                <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{analytics.received_from_others_count}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-green-100 rounded-xl">
                                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Completed</p>
                                                <p className="text-3xl font-bold" style={{ fontFamily: 'Outfit' }}>{analytics.completed_count}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {Object.keys(analytics.task_breakdown).length > 0 && (
                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardHeader>
                                        <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Task Distribution</CardTitle>
                                        <CardDescription>Tasks assigned to team members</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            {Object.entries(analytics.task_breakdown).map(([userId, data]) => (
                                                <div key={userId} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl">
                                                    <span className="font-medium">{data.name}</span>
                                                    <span className="text-2xl font-bold" style={{ fontFamily: 'Outfit' }}>{data.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                </motion.div>
            </main>
        </div>
    );
};

export default AnalyticsPage;