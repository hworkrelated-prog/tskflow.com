import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, BarChart2, Users, CheckCircle2, Clock, TrendingUp, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import OnboardingPopup, { useOnboarding } from '@/components/OnboardingPopup';
import { getErrorMessage } from '@/lib/utils';

const AnalyticsPage = () => {
    const { user } = useAuth();
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    
    // Onboarding
    const { showOnboarding, closeOnboarding, reopenOnboarding } = useOnboarding('analytics');

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
            toast.error(getErrorMessage(error, 'Failed to fetch analytics'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="analytics-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            {/* Onboarding Popup */}
            <AnimatePresence>
                {showOnboarding && (
                    <OnboardingPopup page="analytics" onClose={closeOnboarding} />
                )}
            </AnimatePresence>

            <header className="glass-header border-b">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <Button
                        data-testid="back-button"
                        variant="outline"
                        onClick={() => navigate('/dashboard')}
                        className="rounded-full border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Dashboard
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={reopenOnboarding}
                        className="rounded-full"
                        title="Help & Walkthrough"
                    >
                        <HelpCircle className="w-5 h-5" />
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
                        <p className="text-muted-foreground text-lg">Track your productivity and team performance</p>
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
                            {/* Summary Cards */}
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

                            {/* Detailed Assignee Breakdown */}
                            {analytics.assignee_breakdown && analytics.assignee_breakdown.length > 0 && (
                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardHeader>
                                        <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                            <TrendingUp className="w-6 h-6" />
                                            Team Performance Breakdown
                                        </CardTitle>
                                        <CardDescription>Detailed metrics per assignee</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {/* Table Header */}
                                        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 rounded-xl mb-4 text-sm font-semibold text-muted-foreground">
                                            <div className="col-span-3">Team Member</div>
                                            <div className="col-span-2 text-center">Assigned</div>
                                            <div className="col-span-2 text-center">Completed</div>
                                            <div className="col-span-2 text-center">Pending</div>
                                            <div className="col-span-2 text-center">Completion Rate</div>
                                            <div className="col-span-1 text-center">Avg Days</div>
                                        </div>

                                        {/* Table Rows */}
                                        <div className="space-y-3">
                                            {analytics.assignee_breakdown.map((assignee, index) => (
                                                <motion.div
                                                    key={assignee.email}
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ duration: 0.2, delay: index * 0.05 }}
                                                >
                                                    <Card className="border rounded-xl hover:shadow-md transition-shadow">
                                                        <CardContent className="p-4">
                                                            <div className="grid grid-cols-12 gap-4 items-center">
                                                                {/* Name & Email */}
                                                                <div className="col-span-3 flex items-center gap-3">
                                                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                                                        <span className="font-semibold text-indigo-700">
                                                                            {assignee.name.charAt(0).toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="font-semibold truncate">{assignee.name}</p>
                                                                        <p className="text-xs text-muted-foreground truncate">{assignee.email}</p>
                                                                    </div>
                                                                </div>

                                                                {/* Tasks Assigned */}
                                                                <div className="col-span-2 text-center">
                                                                    <Badge variant="secondary" className="text-lg px-3 py-1">
                                                                        {assignee.tasks_assigned}
                                                                    </Badge>
                                                                </div>

                                                                {/* Tasks Completed */}
                                                                <div className="col-span-2 text-center">
                                                                    <Badge className="bg-green-100 text-green-700 text-lg px-3 py-1">
                                                                        <CheckCircle2 className="w-4 h-4 mr-1" />
                                                                        {assignee.tasks_completed}
                                                                    </Badge>
                                                                </div>

                                                                {/* Tasks Pending */}
                                                                <div className="col-span-2 text-center">
                                                                    {assignee.tasks_pending > 0 ? (
                                                                        <Badge className="bg-amber-100 text-amber-700 text-lg px-3 py-1">
                                                                            <Clock className="w-4 h-4 mr-1" />
                                                                            {assignee.tasks_pending}
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge className="bg-gray-100 text-gray-500 text-lg px-3 py-1">
                                                                            0
                                                                        </Badge>
                                                                    )}
                                                                </div>

                                                                {/* Completion Rate */}
                                                                <div className="col-span-2">
                                                                    <div className="flex flex-col items-center">
                                                                        <span className={`text-lg font-bold ${
                                                                            assignee.completion_rate >= 80 ? 'text-green-600' :
                                                                            assignee.completion_rate >= 50 ? 'text-amber-600' :
                                                                            'text-red-600'
                                                                        }`}>
                                                                            {assignee.completion_rate}%
                                                                        </span>
                                                                        <Progress 
                                                                            value={assignee.completion_rate} 
                                                                            className="h-2 w-full mt-1"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Avg Completion Days */}
                                                                <div className="col-span-1 text-center">
                                                                    {assignee.avg_completion_days !== null ? (
                                                                        <span className="text-sm font-medium">
                                                                            {assignee.avg_completion_days}d
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-sm text-muted-foreground">—</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Empty State — team onboarding */}
                            {(!analytics.assignee_breakdown || analytics.assignee_breakdown.length === 0) && analytics.assigned_to_others_count === 0 && (
                                <Card className="border-2 shadow-soft rounded-2xl" data-testid="analytics-team-onboarding">
                                    <CardContent className="p-12 text-center">
                                        <Users className="w-12 h-12 mx-auto text-indigo-400 mb-4" />
                                        {user?.subscription_tier === 'teams' ? (
                                            <>
                                                <h3 className="text-lg font-semibold mb-2">Set up your team to unlock analytics</h3>
                                                <p className="text-muted-foreground mb-5 max-w-md mx-auto">
                                                    Add direct reports and assign them tasks — then you&apos;ll see completion rates, leaderboards, and hierarchy performance here.
                                                </p>
                                                <Button onClick={() => navigate('/team')} className="rounded-full" data-testid="analytics-setup-team-button">
                                                    <Users className="w-4 h-4 mr-2" /> Set up your team
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <h3 className="text-lg font-semibold mb-2">Create a team to see performance analytics</h3>
                                                <p className="text-muted-foreground mb-5 max-w-md mx-auto">
                                                    Team analytics (completion rates, leaderboards, and reporting hierarchy) are part of the Teams plan. Create your team to get started.
                                                </p>
                                                <Button onClick={() => navigate('/settings')} className="rounded-full" data-testid="analytics-create-team-button">
                                                    Create a team
                                                </Button>
                                            </>
                                        )}
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
