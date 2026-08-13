import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, BarChart2, Users, CheckCircle2, Clock, TrendingUp, HelpCircle, Download, Trophy, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import OnboardingPopup, { useOnboarding } from '@/components/OnboardingPopup';
import { getErrorMessage } from '@/lib/utils';
import { ActivityLogTab } from '@/pages/ActivityLogPage';

// Return YYYY-MM-DD in local time (no TZ drift from toISOString)
const toDateStr = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const rangePresets = () => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);
    return {
        current: { label: 'Current Month', start: toDateStr(startOfMonth), end: toDateStr(endOfMonth) },
        lastMonth: { label: 'Last Month', start: toDateStr(startOfLastMonth), end: toDateStr(endOfLastMonth) },
        lastWeek: { label: 'Last Week', start: toDateStr(oneWeekAgo), end: toDateStr(today) },
        lastTwoWeeks: { label: 'Last Two Weeks', start: toDateStr(twoWeeksAgo), end: toDateStr(today) },
    };
};

const AnalyticsPage = () => {
    const { user } = useAuth();
    const presets = rangePresets();
    const [searchParams, setSearchParams] = useSearchParams();
    const [startDate, setStartDate] = useState(presets.current.start);
    const [endDate, setEndDate] = useState(presets.current.end);
    const [activePreset, setActivePreset] = useState('current');
    const sectionParam = searchParams.get('section');
    const [section, setSection] = useState(
        ['analytics', 'activity', 'personal_lb', 'org_lb'].includes(sectionParam) ? sectionParam : 'analytics'
    );
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    
    // Onboarding
    const { showOnboarding, closeOnboarding, reopenOnboarding } = useOnboarding('analytics');

    const selectSection = (key) => {
        setSection(key);
        if (key === 'analytics') {
            setSearchParams({}, { replace: true });
        } else {
            setSearchParams({ section: key }, { replace: true });
        }
    };

    useEffect(() => {
        if (['analytics', 'activity', 'personal_lb', 'org_lb'].includes(sectionParam) && sectionParam !== section) {
            setSection(sectionParam);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sectionParam]);

    const fetchAnalytics = useCallback(async (s, e) => {
        if (!s || !e) return;
        setLoading(true);
        try {
            const response = await axios.post(`${API}/analytics`, {
                start_date: s,
                end_date: e,
            });
            setAnalytics(response.data);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to fetch analytics'));
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-fetch on load with Current Month default
    useEffect(() => {
        fetchAnalytics(presets.current.start, presets.current.end);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applyPreset = (key) => {
        const p = presets[key];
        if (!p) return;
        setStartDate(p.start);
        setEndDate(p.end);
        setActivePreset(key);
        fetchAnalytics(p.start, p.end);
    };

    const handleFetchAnalytics = (e) => {
        e.preventDefault();
        setActivePreset('custom');
        fetchAnalytics(startDate, endDate);
    };

    const downloadAnalyticsCSV = () => {
        if (!analytics) return;
        const rows = [
            ['Name', 'Email', 'Tasks Assigned', 'Tasks Completed', 'Tasks Pending', 'Completion Rate (%)', 'Response Rate (%)', 'Avg Response (hours)', 'Avg Completion (days)']
        ];
        (analytics.assignee_breakdown || []).forEach((a) => {
            rows.push([
                a.name,
                a.email,
                a.tasks_assigned,
                a.tasks_completed,
                a.tasks_pending,
                a.completion_rate,
                a.response_rate ?? 0,
                a.avg_response_hours ?? '',
                a.avg_completion_days ?? ''
            ]);
        });
        const csv = rows.map(r => r.map(cell => {
            const s = String(cell ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `tskflow-analytics-${startDate}-to-${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('Analytics CSV downloaded');
    };

    return (
        <div data-testid="analytics-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
            {/* Onboarding Popup */}
            <AnimatePresence>
                {showOnboarding && (
                    <OnboardingPopup page="analytics" onClose={closeOnboarding} />
                )}
            </AnimatePresence>

            <header className="glass-header border-b sticky top-0 z-30 bg-white/95 backdrop-blur">
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

                    {/* Section tabs — Overall Analytics + Activity Log + Leaderboards */}
                    <div className="flex flex-wrap gap-2 justify-center">
                        {[
                            { key: 'analytics', label: 'Overall Analytics' },
                            { key: 'activity', label: 'Activity Log' },
                            { key: 'personal_lb', label: 'Team Leaderboard' },
                            { key: 'org_lb', label: 'Organization Leaderboard' },
                        ].map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => selectSection(t.key)}
                                data-testid={`analytics-section-${t.key}`}
                                className={`px-4 py-2 rounded-full text-sm font-medium border ${section === t.key ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {section === 'activity' && <ActivityLogTab />}

                    {(section === 'personal_lb' || section === 'org_lb') && (
                        <LeaderboardTab section={section} startDate={startDate} endDate={endDate} />
                    )}

                    {section === 'analytics' && (
                    <>
                    <Card className="border-2 shadow-soft rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Select Time Period</CardTitle>
                            <CardDescription>Choose a shortcut or a custom date range</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {/* Shortcut buttons */}
                            <div className="flex flex-wrap items-center gap-2 mb-5">
                                {[
                                    { key: 'current', label: 'Current Month' },
                                    { key: 'lastMonth', label: 'Last Month' },
                                    { key: 'lastWeek', label: 'Last Week' },
                                    { key: 'lastTwoWeeks', label: 'Last Two Weeks' },
                                ].map((p) => (
                                    <button
                                        key={p.key}
                                        type="button"
                                        onClick={() => applyPreset(p.key)}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                                            activePreset === p.key
                                                ? 'bg-teal-600 border-teal-600 text-white'
                                                : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300'
                                        }`}
                                        data-testid={`analytics-preset-${p.key}`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                                <span className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                                    activePreset === 'custom' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-gray-200 text-gray-500'
                                }`}>
                                    Custom range ↓
                                </span>
                            </div>
                            <form onSubmit={handleFetchAnalytics} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="startDate">Start Date</Label>
                                        <Input
                                            id="startDate"
                                            data-testid="start-date-input"
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => { setStartDate(e.target.value); setActivePreset('custom'); }}
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
                                            onChange={(e) => { setEndDate(e.target.value); setActivePreset('custom'); }}
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
                                            <div className="p-3 bg-teal-100 rounded-xl">
                                                <Users className="w-6 h-6 text-teal-600" />
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

                            {/* Best / Worst executor analysis */}
                            {analytics.assignee_breakdown && analytics.assignee_breakdown.length >= 2 && (
                                <BestWorstAnalysis breakdown={analytics.assignee_breakdown} />
                            )}

                            {/* Detailed Assignee Breakdown */}
                            {analytics.assignee_breakdown && analytics.assignee_breakdown.length > 0 && (
                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardHeader>
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                                    <TrendingUp className="w-6 h-6" />
                                                    Team Performance Breakdown
                                                </CardTitle>
                                                <CardDescription>Detailed metrics per assignee</CardDescription>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={downloadAnalyticsCSV}
                                                className="rounded-full shrink-0"
                                                data-testid="download-analytics-csv"
                                            >
                                                <Download className="w-4 h-4 mr-2" />
                                                Download CSV
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {/* Table Header — sticky when scrolling. Offset by page header height so it never gets hidden. */}
                                        <div className="grid grid-cols-14 gap-3 px-3 py-3 bg-white rounded-xl mb-4 text-xs font-semibold text-muted-foreground sticky top-[68px] z-20 border shadow-sm" style={{ gridTemplateColumns: 'minmax(0, 2.5fr) repeat(6, minmax(0, 1fr))' }} data-testid="analytics-table-header">
                                            <div>Team Member</div>
                                            <div className="text-center">Assigned</div>
                                            <div className="text-center">Completed</div>
                                            <div className="text-center">Pending</div>
                                            <div className="text-center">Completion</div>
                                            <div className="text-center">Response Rate</div>
                                            <div className="text-center">Avg Response</div>
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
                                                            <div className="grid gap-3 items-center" style={{ gridTemplateColumns: 'minmax(0, 2.5fr) repeat(6, minmax(0, 1fr))' }}>
                                                                {/* Name & Email */}
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                                                                        <span className="font-semibold text-teal-700">
                                                                            {assignee.name.charAt(0).toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="font-semibold truncate">{assignee.name}</p>
                                                                        <p className="text-xs text-muted-foreground truncate">{assignee.email}</p>
                                                                    </div>
                                                                </div>

                                                                {/* Tasks Assigned */}
                                                                <div className="text-center">
                                                                    <Badge variant="secondary" className="px-2.5 py-1">
                                                                        {assignee.tasks_assigned}
                                                                    </Badge>
                                                                </div>

                                                                {/* Tasks Completed */}
                                                                <div className="text-center">
                                                                    <Badge className="bg-green-100 text-green-700 px-2.5 py-1">
                                                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                                                        {assignee.tasks_completed}
                                                                    </Badge>
                                                                </div>

                                                                {/* Tasks Pending */}
                                                                <div className="text-center">
                                                                    {assignee.tasks_pending > 0 ? (
                                                                        <Badge className="bg-amber-100 text-amber-700 px-2.5 py-1">
                                                                            <Clock className="w-3.5 h-3.5 mr-1" />
                                                                            {assignee.tasks_pending}
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge className="bg-gray-100 text-gray-500 px-2.5 py-1">
                                                                            0
                                                                        </Badge>
                                                                    )}
                                                                </div>

                                                                {/* Completion Rate */}
                                                                <div>
                                                                    <div className="flex flex-col items-center">
                                                                        <span className={`text-base font-bold ${
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

                                                                {/* Response Rate */}
                                                                <div>
                                                                    <div className="flex flex-col items-center">
                                                                        <span className={`text-base font-bold ${
                                                                            (assignee.response_rate || 0) >= 80 ? 'text-green-600' :
                                                                            (assignee.response_rate || 0) >= 50 ? 'text-amber-600' :
                                                                            'text-red-600'
                                                                        }`}>
                                                                            {assignee.response_rate || 0}%
                                                                        </span>
                                                                        <Progress 
                                                                            value={assignee.response_rate || 0} 
                                                                            className="h-2 w-full mt-1"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Avg Response Hours */}
                                                                <div className="text-center">
                                                                    {assignee.avg_response_hours !== null && assignee.avg_response_hours !== undefined ? (
                                                                        <span className="text-sm font-medium">
                                                                            {assignee.avg_response_hours < 1
                                                                                ? `${Math.round(assignee.avg_response_hours * 60)}m`
                                                                                : assignee.avg_response_hours < 24
                                                                                    ? `${assignee.avg_response_hours}h`
                                                                                    : `${(assignee.avg_response_hours / 24).toFixed(1)}d`}
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
                                        <Users className="w-12 h-12 mx-auto text-teal-400 mb-4" />
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
                    </>
                    )}
                </motion.div>
            </main>
        </div>
    );
};

// Simple leaderboard tab embedded inside Analytics
const LeaderboardTab = ({ section, startDate, endDate }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('rank');
    const [sortDir, setSortDir] = useState('asc');
    const endpoint = section === 'org_lb' ? 'org' : 'personal';

    useEffect(() => {
        (async () => {
            if (!startDate || !endDate) return;
            setLoading(true);
            try {
                const res = await axios.get(`${API}/leaderboard/${endpoint}`, { params: { start_date: startDate, end_date: endDate } });
                setRows(res.data?.leaderboard || []);
            } catch (_) { setRows([]); }
            finally { setLoading(false); }
        })();
    }, [endpoint, startDate, endDate]);

    // Human-friendly hour formatting
    const fmtHours = (h) => {
        if (h == null || isNaN(h)) return '—';
        const mins = Math.round(Number(h) * 60);
        if (mins < 1) return '<1 min';
        if (mins < 60) return `${mins} min`;
        const hrs = Math.floor(mins / 60);
        const rem = mins - hrs * 60;
        return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
    };

    // Derived rows with streaks + badges
    const derived = React.useMemo(() => {
        const scored = rows.map((r, i) => {
            const streak = r.streak != null ? r.streak : Math.max(0, Math.round((r.completed || 0) - Math.random() * 0)); // approximation if server didn't send
            const badges = [];
            if (i === 0 && (r.completed || 0) > 0) badges.push({ label: '🏆 Fastest', tone: 'amber' });
            if ((r.completed || 0) >= 10) badges.push({ label: 'Consistent', tone: 'indigo' });
            if ((r.avg_response_hours != null) && r.avg_response_hours <= 2) badges.push({ label: '⚡ Snappy', tone: 'emerald' });
            if ((r.performance_score || 0) >= 90) badges.push({ label: 'All-star', tone: 'purple' });
            return { ...r, streak, badges };
        });
        return scored;
    }, [rows]);

    const sorted = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        let filtered = derived;
        if (q) filtered = filtered.filter(r => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
        const dir = sortDir === 'asc' ? 1 : -1;
        const val = (r, k) => {
            if (k === 'rank') return r.rank || 999;
            if (k === 'name') return (r.name || '').toLowerCase();
            if (k === 'completed') return r.completed || 0;
            if (k === 'avg_completion_hours') return r.avg_completion_hours ?? 9999;
            if (k === 'avg_response_hours') return r.avg_response_hours ?? 9999;
            if (k === 'performance_score') return r.performance_score || 0;
            if (k === 'streak') return r.streak || 0;
            return 0;
        };
        return [...filtered].sort((a, b) => (val(a, sortBy) < val(b, sortBy) ? -1 : val(a, sortBy) > val(b, sortBy) ? 1 : 0) * dir);
    }, [derived, search, sortBy, sortDir]);

    const toggleSort = (key) => {
        if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(key); setSortDir(key === 'rank' || key === 'name' ? 'asc' : 'desc'); }
    };

    const Th = ({ label, k }) => (
        <th className="text-left px-3 py-2 font-medium select-none cursor-pointer hover:bg-gray-100" onClick={() => toggleSort(k)}>
            <span className="inline-flex items-center gap-1">
                {label}
                {sortBy === k && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
            </span>
        </th>
    );

    return (
        <Card className="border-2 rounded-2xl">
            <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                    <p className="text-sm text-muted-foreground">
                        {section === 'org_lb'
                            ? 'Everyone in your organization, ranked by an overall performance score. Sort or search below.'
                            : 'Team leaderboard \u2014 people you\u2019ve assigned tasks to, ranked by speed and completion. Sort or search below.'}
                    </p>
                    <div className="relative w-full sm:w-64">
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="pl-8 rounded-full h-9" data-testid="leaderboard-search" />
                        <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></svg>
                    </div>
                </div>
                {loading && <div className="text-sm text-muted-foreground py-4">Loading...</div>}
                {!loading && (
                    <div className="border rounded-xl overflow-x-auto">
                        <table className="w-full text-sm" data-testid="leaderboard-table">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <Th label="#" k="rank" />
                                    <Th label="Person" k="name" />
                                    <Th label="Completed" k="completed" />
                                    <Th label="Avg completion" k="avg_completion_hours" />
                                    <Th label="Avg response" k="avg_response_hours" />
                                    <Th label="Streak" k="streak" />
                                    <th className="text-left px-3 py-2 font-medium">Badges</th>
                                    {section === 'org_lb' && <Th label="Performance" k="performance_score" />}
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.length === 0 && (<tr><td colSpan={section === 'org_lb' ? 8 : 7} className="px-3 py-8 text-center text-gray-500">No data yet for this range.</td></tr>)}
                                {sorted.map((r) => (
                                    <tr key={r.user_id} className="border-t hover:bg-slate-50">
                                        <td className="px-3 py-2 font-mono">{r.rank}</td>
                                        <td className="px-3 py-2"><div className="font-medium">{r.name}</div><div className="text-xs text-gray-500">{r.email}</div></td>
                                        <td className="px-3 py-2 font-semibold">{r.completed}</td>
                                        <td className="px-3 py-2">{fmtHours(r.avg_completion_hours)}</td>
                                        <td className="px-3 py-2">{fmtHours(r.avg_response_hours)}</td>
                                        <td className="px-3 py-2">{r.streak > 0 ? <span className="inline-flex items-center gap-1 text-orange-600">🔥 {r.streak}</span> : '—'}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-wrap gap-1">
                                                {r.badges.map((b, i) => (
                                                    <Badge key={i} variant="outline" className={`text-[10px] border-${b.tone}-200 bg-${b.tone}-50 text-${b.tone}-700`}>{b.label}</Badge>
                                                ))}
                                            </div>
                                        </td>
                                        {section === 'org_lb' && <td className="px-3 py-2 font-semibold text-teal-700">{r.performance_score}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default AnalyticsPage;

// ---- Best / Worst executor analysis card ----
// Ranks assignees using a composite score:
//   score = 0.55 * completion_rate + 0.25 * response_rate + 0.20 * speed_score
// where speed_score = 100 * (1 - min(avg_response_hours, 72) / 72), so fast responders score higher.
// Only assignees with tasks_assigned > 0 are considered.
const BestWorstAnalysis = ({ breakdown }) => {
    const rows = (breakdown || []).filter((a) => (a.tasks_assigned || 0) > 0);
    if (rows.length < 2) return null;

    const speedScore = (h) => {
        if (h == null) return 50; // neutral if unknown
        const capped = Math.min(72, Math.max(0, h));
        return Math.round(100 * (1 - capped / 72));
    };
    const scored = rows.map((a) => ({
        ...a,
        _speed: speedScore(a.avg_response_hours),
        _score: Math.round(
            0.55 * (a.completion_rate || 0) +
            0.25 * (a.response_rate || 0) +
            0.20 * speedScore(a.avg_response_hours)
        ),
    })).sort((a, b) => b._score - a._score);

    const best = scored[0];
    const worst = scored[scored.length - 1];
    if (best.email === worst.email) return null;

    // Team medians for the "why"
    const median = (arr) => {
        if (arr.length === 0) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    };
    // Precompute medians so we can enrich the tooltip if we ever want to show a longer explanation.
    void median(scored.map((s) => s.completion_rate || 0));
    void median(scored.map((s) => (s.avg_response_hours == null ? 0 : s.avg_response_hours)));

    const fmtHrs = (h) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h}h` : `${(h / 24).toFixed(1)}d`);
    // Note: removed the full "Why" bullet lists per user feedback that best/worst was too prominent.

    return (
        <Card className="border shadow-soft rounded-2xl bg-gradient-to-br from-white to-gray-50" data-testid="best-worst-analysis-card">
            <CardContent className="py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Best — compact */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100" data-testid="best-performer-card">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <Trophy className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">Top performer · {best._score}</p>
                        <p className="text-sm font-semibold truncate">{best.name}</p>
                        <p className="text-xs text-emerald-800 truncate">
                            {best.tasks_completed}/{best.tasks_assigned} done ({best.completion_rate || 0}%) · responds in {fmtHrs(best.avg_response_hours)}
                        </p>
                    </div>
                </div>

                {/* Worst — compact */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50/60 border border-red-100" data-testid="worst-performer-card">
                    <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-red-700 font-semibold">Needs a check-in · {worst._score}</p>
                        <p className="text-sm font-semibold truncate">{worst.name}</p>
                        <p className="text-xs text-red-800 truncate">
                            {worst.tasks_completed}/{worst.tasks_assigned} done ({worst.completion_rate || 0}%) · responds in {fmtHrs(worst.avg_response_hours)}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
