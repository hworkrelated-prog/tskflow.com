import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API } from '@/App';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, UserPlus, Trash2, DollarSign, Users as UsersIcon, GitBranch, ChevronRight, Clock, CheckCircle2, AlertCircle, UserCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { getErrorMessage } from '@/lib/utils';

const TeamManagementPage = () => {
    const { user } = useAuth();
    const [members, setMembers] = useState([]);
    const [billing, setBilling] = useState(null);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviting, setInviting] = useState(false);
    const [showInviteDialog, setShowInviteDialog] = useState(false);
    
    // Direct Reports State
    const [directReports, setDirectReports] = useState([]);
    const [potentialReports, setPotentialReports] = useState([]);
    const [myManager, setMyManager] = useState(null);
    const [showAddReportDialog, setShowAddReportDialog] = useState(false);
    const [showSetManagerDialog, setShowSetManagerDialog] = useState(false);
    const [selectedReport, setSelectedReport] = useState('');
    const [selectedManager, setSelectedManager] = useState('');
    const [addingReport, setAddingReport] = useState(false);
    const [settingManager, setSettingManager] = useState(false);
    
    // Performance Analytics State
    const [performance, setPerformance] = useState(null);
    
    const navigate = useNavigate();

    useEffect(() => {
        if (user?.subscription_tier !== 'teams') {
            navigate('/settings');
            return;
        }
        fetchAllData();
    }, [user]);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [reports, potential, manager, perf] = await Promise.allSettled([
                axios.get(`${API}/team/direct-reports`),
                axios.get(`${API}/team/potential-reports`),
                axios.get(`${API}/team/my-manager`),
                axios.get(`${API}/team/performance`)
            ]);

            if (reports.status === 'fulfilled') setDirectReports(reports.value.data);
            if (potential.status === 'fulfilled') setPotentialReports(potential.value.data);
            if (manager.status === 'fulfilled') setMyManager(manager.value.data.manager);
            if (perf.status === 'fulfilled') setPerformance(perf.value.data);

            if (user?.is_team_owner) {
                const [mem, bill] = await Promise.allSettled([
                    axios.get(`${API}/team/members`),
                    axios.get(`${API}/team/billing`)
                ]);
                if (mem.status === 'fulfilled') setMembers(mem.value.data);
                if (bill.status === 'fulfilled') setBilling(bill.value.data);
            }
        } catch (error) {
            console.error('Failed to load team data:', error);
            toast.error('Failed to load some team data');
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        setInviting(true);

        try {
            await axios.post(`${API}/team/invite`, { email: inviteEmail });
            toast.success(`Invitation sent to ${inviteEmail}`);
            setInviteEmail('');
            setShowInviteDialog(false);
            fetchAllData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to send invitation'));
        } finally {
            setInviting(false);
        }
    };

    const handleRemoveMember = async (memberId, memberEmail) => {
        if (!window.confirm(`Remove ${memberEmail} from team?`)) return;

        try {
            await axios.delete(`${API}/team/members/${memberId}`);
            toast.success('Member removed from team');
            fetchAllData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to remove member'));
        }
    };

    const handleAddDirectReport = async () => {
        if (!selectedReport) return;
        setAddingReport(true);
        
        try {
            await axios.post(`${API}/team/add-direct-report`, { user_id: selectedReport });
            toast.success('Direct report added successfully');
            setShowAddReportDialog(false);
            setSelectedReport('');
            fetchAllData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to add direct report'));
        } finally {
            setAddingReport(false);
        }
    };

    const handleRemoveDirectReport = async (userId, userName) => {
        if (!window.confirm(`Remove ${userName} from your direct reports?`)) return;
        
        try {
            await axios.delete(`${API}/team/direct-report/${userId}`);
            toast.success(`${userName} removed from your direct reports`);
            fetchAllData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to remove direct report'));
        }
    };

    const handleSetManager = async () => {
        setSettingManager(true);
        
        try {
            await axios.post(`${API}/team/set-manager`, { 
                manager_id: selectedManager || null 
            });
            toast.success(selectedManager ? 'Manager updated' : 'Manager removed');
            setShowSetManagerDialog(false);
            setSelectedManager('');
            fetchAllData();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update manager'));
        } finally {
            setSettingManager(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium">Loading...</div>
            </div>
        );
    }

    return (
        <div data-testid="team-management-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            <header className="glass-header border-b">
                <div className="container mx-auto px-6 py-4">
                    <Button
                        data-testid="back-button"
                        variant="outline"
                        onClick={() => navigate('/dashboard')}
                        className="rounded-full border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Dashboard
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
                        <h1 className="text-5xl font-bold mb-2 text-foreground" style={{ fontFamily: 'Outfit' }}>Team Management</h1>
                        <p className="text-muted-foreground text-lg">Manage your team, direct reports, and hierarchy</p>
                    </div>

                    <Tabs defaultValue="direct-reports" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 mb-8">
                            <TabsTrigger value="direct-reports" className="rounded-full">
                                <GitBranch className="w-4 h-4 mr-2" />
                                Direct Reports
                            </TabsTrigger>
                            <TabsTrigger value="performance" className="rounded-full">
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Performance
                            </TabsTrigger>
                            <TabsTrigger value="my-hierarchy" className="rounded-full">
                                <UserCheck className="w-4 h-4 mr-2" />
                                My Hierarchy
                            </TabsTrigger>
                            {user?.is_team_owner && (
                                <TabsTrigger value="team-admin" className="rounded-full">
                                    <UsersIcon className="w-4 h-4 mr-2" />
                                    Team Admin
                                </TabsTrigger>
                            )}
                        </TabsList>

                        {/* Performance Analytics Tab */}
                        <TabsContent value="performance">
                            <Card className="border-2 shadow-soft rounded-2xl">
                                <CardHeader>
                                    <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                        <CheckCircle2 className="w-6 h-6" />
                                        Team Performance
                                    </CardTitle>
                                    <CardDescription>Performance metrics for your direct reports</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {performance?.direct_reports?.length > 0 ? (
                                        <div className="space-y-6">
                                            {/* Leaderboard */}
                                            <div>
                                                <h3 className="font-semibold mb-3 text-foreground">Leaderboard (by Completion Rate)</h3>
                                                <div className="space-y-2">
                                                    {performance.leaderboard?.map((person, index) => (
                                                        <div key={person.user_id} className={`flex items-center justify-between p-3 rounded-xl ${index === 0 ? 'bg-amber-50 border border-amber-200' : index === 1 ? 'bg-gray-100 border border-gray-200' : index === 2 ? 'bg-orange-50 border border-orange-200' : 'bg-background border'}`}>
                                                            <div className="flex items-center gap-3">
                                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${index === 0 ? 'bg-amber-500 text-white' : index === 1 ? 'bg-gray-400 text-white' : index === 2 ? 'bg-orange-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                                                    {index + 1}
                                                                </span>
                                                                <div>
                                                                    <p className="font-medium text-foreground">{person.name}</p>
                                                                    <p className="text-xs text-muted-foreground">{person.email}</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="font-bold text-foreground">{person.completion_rate}%</p>
                                                                <p className="text-xs text-muted-foreground">{person.tasks_completed}/{person.tasks_assigned} tasks</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Detailed Stats Table */}
                                            <div>
                                                <h3 className="font-semibold mb-3 text-foreground">Detailed Statistics</h3>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="border-b">
                                                                <th className="text-left py-2 px-3 text-foreground">Name</th>
                                                                <th className="text-center py-2 px-3 text-foreground">Assigned</th>
                                                                <th className="text-center py-2 px-3 text-foreground">Completed</th>
                                                                <th className="text-center py-2 px-3 text-foreground">Rate</th>
                                                                <th className="text-center py-2 px-3 text-foreground">Avg Time</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {performance.direct_reports?.map((person) => (
                                                                <tr key={person.user_id} className="border-b last:border-0">
                                                                    <td className="py-3 px-3">
                                                                        <div>
                                                                            <p className="font-medium text-foreground">{person.name}</p>
                                                                            <p className="text-xs text-muted-foreground">{person.email}</p>
                                                                        </div>
                                                                    </td>
                                                                    <td className="text-center py-3 px-3 text-foreground">{person.tasks_assigned}</td>
                                                                    <td className="text-center py-3 px-3 text-foreground">{person.tasks_completed}</td>
                                                                    <td className="text-center py-3 px-3">
                                                                        <Badge className={`${person.completion_rate >= 80 ? 'bg-green-100 text-green-800' : person.completion_rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                                                            {person.completion_rate}%
                                                                        </Badge>
                                                                    </td>
                                                                    <td className="text-center py-3 px-3 text-foreground">
                                                                        {person.avg_completion_time ? `${person.avg_completion_time} days` : '-'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12">
                                            <CheckCircle2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                                            <p className="text-muted-foreground">No performance data yet</p>
                                            <p className="text-sm text-muted-foreground">Add direct reports and assign them tasks to see metrics</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Direct Reports Tab */}
                        <TabsContent value="direct-reports">
                            <Card className="border-2 shadow-soft rounded-2xl">
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                                <GitBranch className="w-6 h-6" />
                                                My Direct Reports
                                            </CardTitle>
                                            <CardDescription>People who report to you with task metrics</CardDescription>
                                        </div>
                                        <Dialog open={showAddReportDialog} onOpenChange={setShowAddReportDialog}>
                                            <DialogTrigger asChild>
                                                <Button className="rounded-full">
                                                    <UserPlus className="w-4 h-4 mr-2" />
                                                    Add Direct Report
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="rounded-2xl">
                                                <DialogHeader>
                                                    <DialogTitle>Add Direct Report</DialogTitle>
                                                    <DialogDescription>
                                                        Select a team member to add as your direct report
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-4 pt-4">
                                                    <div className="space-y-2">
                                                        <Label>Select Team Member</Label>
                                                        <Select value={selectedReport} onValueChange={setSelectedReport}>
                                                            <SelectTrigger className="rounded-xl">
                                                                <SelectValue placeholder="Choose a team member" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {potentialReports.map((p) => (
                                                                    <SelectItem key={p.id} value={p.id}>
                                                                        <div className="flex items-center gap-2">
                                                                            <span>{p.name}</span>
                                                                            <span className="text-xs text-muted-foreground">({p.email})</span>
                                                                            {p.current_manager && (
                                                                                <Badge variant="outline" className="ml-2 text-xs">
                                                                                    Reports to: {p.current_manager}
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        {potentialReports.length === 0 && (
                                                            <p className="text-sm text-muted-foreground">
                                                                No available team members to add
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2 justify-end">
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => setShowAddReportDialog(false)}
                                                            className="rounded-full"
                                                        >
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            onClick={handleAddDirectReport}
                                                            disabled={!selectedReport || addingReport}
                                                            className="rounded-full"
                                                        >
                                                            {addingReport ? 'Adding...' : 'Add Direct Report'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {directReports.length === 0 ? (
                                        <div className="text-center py-12">
                                            <GitBranch className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                            <p className="text-muted-foreground">No direct reports yet</p>
                                            <p className="text-sm text-muted-foreground mt-2">
                                                Add team members who report to you to track their task progress
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Header Row */}
                                            <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-gray-50 rounded-xl text-sm font-medium text-muted-foreground">
                                                <div className="col-span-4">Team Member</div>
                                                <div className="col-span-2 text-center">Pending Tasks</div>
                                                <div className="col-span-2 text-center">Completed</div>
                                                <div className="col-span-2 text-center">Avg. Time</div>
                                                <div className="col-span-2 text-center">Actions</div>
                                            </div>
                                            
                                            {directReports.map((report, index) => (
                                                <motion.div
                                                    key={report.user_id}
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ duration: 0.2, delay: index * 0.05 }}
                                                >
                                                    <Card className="border rounded-xl hover:shadow-md transition-shadow">
                                                        <CardContent className="p-4">
                                                            <div className="grid grid-cols-12 gap-4 items-center">
                                                                {/* Team Member */}
                                                                <div className="col-span-4 flex items-center gap-3">
                                                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                                                        <span className="font-semibold text-indigo-700">
                                                                            {report.name.charAt(0).toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-semibold">{report.name}</p>
                                                                        <p className="text-xs text-muted-foreground">{report.email}</p>
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Pending Tasks */}
                                                                <div className="col-span-2 text-center">
                                                                    <div className="flex items-center justify-center gap-2">
                                                                        {report.tasks_from_you_pending > 0 ? (
                                                                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                                                <AlertCircle className="w-3 h-3 mr-1" />
                                                                                {report.tasks_from_you_pending}
                                                                            </Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                                                                0
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Completed */}
                                                                <div className="col-span-2 text-center">
                                                                    <Badge variant="secondary" className="rounded-md">
                                                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                                                        {report.tasks_from_you_completed}
                                                                    </Badge>
                                                                </div>
                                                                
                                                                {/* Avg Completion Time */}
                                                                <div className="col-span-2 text-center">
                                                                    {report.avg_completion_days !== null ? (
                                                                        <Badge variant="outline" className="rounded-md">
                                                                            <Clock className="w-3 h-3 mr-1" />
                                                                            {report.avg_completion_days}d
                                                                        </Badge>
                                                                    ) : (
                                                                        <span className="text-xs text-muted-foreground">—</span>
                                                                    )}
                                                                </div>
                                                                
                                                                {/* Actions */}
                                                                <div className="col-span-2 text-center">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleRemoveDirectReport(report.user_id, report.name)}
                                                                        className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Privacy Notice */}
                            <Card className="border-2 shadow-soft rounded-2xl bg-blue-50 mt-6">
                                <CardContent className="p-6">
                                    <h3 className="font-semibold mb-2">🔒 Privacy Notice</h3>
                                    <p className="text-sm text-muted-foreground">
                                        You can only see tasks that <strong>you assigned</strong> to your direct reports.
                                        Their self-assigned tasks and tasks from others remain private.
                                    </p>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* My Hierarchy Tab */}
                        <TabsContent value="my-hierarchy">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Who I Report To */}
                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardHeader>
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <ChevronRight className="w-5 h-5 rotate-[-90deg]" />
                                            Who I Report To
                                        </CardTitle>
                                        <CardDescription>Your manager in the organization</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {myManager ? (
                                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                                                        <span className="font-semibold text-indigo-700 text-lg">
                                                            {myManager.name.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold">{myManager.name}</p>
                                                        <p className="text-sm text-muted-foreground">{myManager.email}</p>
                                                    </div>
                                                </div>
                                                <Badge className="bg-indigo-100 text-indigo-700">Manager</Badge>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8">
                                                <UserCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                                                <p className="text-muted-foreground">No manager set</p>
                                            </div>
                                        )}
                                        
                                        <Dialog open={showSetManagerDialog} onOpenChange={setShowSetManagerDialog}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="w-full mt-4 rounded-full">
                                                    {myManager ? 'Change Manager' : 'Set Manager'}
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="rounded-2xl">
                                                <DialogHeader>
                                                    <DialogTitle>Set Your Manager</DialogTitle>
                                                    <DialogDescription>
                                                        Choose who you report to in the organization
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="space-y-4 pt-4">
                                                    <div className="space-y-2">
                                                        <Label>Select Manager</Label>
                                                        <Select value={selectedManager} onValueChange={setSelectedManager}>
                                                            <SelectTrigger className="rounded-xl">
                                                                <SelectValue placeholder="Choose your manager" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="">
                                                                    <span className="text-muted-foreground">No manager (remove)</span>
                                                                </SelectItem>
                                                                {potentialReports.map((p) => (
                                                                    <SelectItem key={p.id} value={p.id}>
                                                                        {p.name} ({p.email})
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="flex gap-2 justify-end">
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => setShowSetManagerDialog(false)}
                                                            className="rounded-full"
                                                        >
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            onClick={handleSetManager}
                                                            disabled={settingManager}
                                                            className="rounded-full"
                                                        >
                                                            {settingManager ? 'Saving...' : 'Save'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </CardContent>
                                </Card>

                                {/* Summary Card */}
                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardHeader>
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <GitBranch className="w-5 h-5" />
                                            My Team Summary
                                        </CardTitle>
                                        <CardDescription>Overview of your position</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-indigo-50 rounded-xl text-center">
                                                <p className="text-3xl font-bold text-indigo-700" style={{ fontFamily: 'Outfit' }}>
                                                    {directReports.length}
                                                </p>
                                                <p className="text-sm text-muted-foreground">Direct Reports</p>
                                            </div>
                                            <div className="p-4 bg-emerald-50 rounded-xl text-center">
                                                <p className="text-3xl font-bold text-emerald-700" style={{ fontFamily: 'Outfit' }}>
                                                    {directReports.reduce((sum, dr) => sum + dr.tasks_from_you_pending, 0)}
                                                </p>
                                                <p className="text-sm text-muted-foreground">Pending Tasks Assigned</p>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-xl">
                                            <p className="text-sm text-muted-foreground mb-1">Reports to</p>
                                            <p className="font-semibold">
                                                {myManager ? myManager.name : 'No manager set'}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        {/* Team Admin Tab (Team Owners Only) */}
                        {user?.is_team_owner && (
                            <TabsContent value="team-admin">
                                {/* Billing Card */}
                                <Card className="border-2 shadow-soft rounded-2xl mb-6">
                                    <CardHeader>
                                        <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                            <DollarSign className="w-6 h-6" />
                                            Billing Overview
                                        </CardTitle>
                                        <CardDescription>Your team subscription costs</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="p-4 bg-indigo-50 rounded-xl">
                                                <p className="text-sm text-muted-foreground">Active Users</p>
                                                <p className="text-4xl font-bold mt-1" style={{ fontFamily: 'Outfit' }}>{billing?.active_users || 0}</p>
                                            </div>
                                            <div className="p-4 bg-green-50 rounded-xl">
                                                <p className="text-sm text-muted-foreground">Cost per User</p>
                                                <p className="text-4xl font-bold mt-1" style={{ fontFamily: 'Outfit' }}>${billing?.cost_per_user || 12}</p>
                                            </div>
                                            <div className="p-4 bg-amber-50 rounded-xl">
                                                <p className="text-sm text-muted-foreground">Total Monthly Cost</p>
                                                <p className="text-4xl font-bold mt-1" style={{ fontFamily: 'Outfit' }}>${billing?.total_monthly_cost || 0}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Team Members */}
                                <Card className="border-2 shadow-soft rounded-2xl">
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                                    <UsersIcon className="w-6 h-6" />
                                                    All Team Members
                                                </CardTitle>
                                                <CardDescription>People on your {user?.email?.split('@')[1]} workspace</CardDescription>
                                            </div>
                                            <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                                                <DialogTrigger asChild>
                                                    <Button className="rounded-full">
                                                        <UserPlus className="w-4 h-4 mr-2" />
                                                        Invite Member
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="rounded-2xl">
                                                    <DialogHeader>
                                                        <DialogTitle>Invite Team Member</DialogTitle>
                                                        <DialogDescription>Send an invitation to join your team workspace</DialogDescription>
                                                    </DialogHeader>
                                                    <form onSubmit={handleInvite} className="space-y-4 pt-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="inviteEmail">Email Address</Label>
                                                            <Input
                                                                id="inviteEmail"
                                                                data-testid="invite-email-input"
                                                                type="email"
                                                                placeholder={`name@${user?.email?.split('@')[1]}`}
                                                                value={inviteEmail}
                                                                onChange={(e) => setInviteEmail(e.target.value)}
                                                                required
                                                                className="rounded-xl"
                                                            />
                                                            <p className="text-xs text-muted-foreground">
                                                                Must be from {user?.email?.split('@')[1]} domain
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-2 justify-end">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                onClick={() => setShowInviteDialog(false)}
                                                                className="rounded-full"
                                                            >
                                                                Cancel
                                                            </Button>
                                                            <Button
                                                                data-testid="send-invite-button"
                                                                type="submit"
                                                                disabled={inviting}
                                                                className="rounded-full"
                                                            >
                                                                {inviting ? 'Sending...' : 'Send Invitation'}
                                                            </Button>
                                                        </div>
                                                    </form>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {members.length === 0 ? (
                                                <p className="text-center text-muted-foreground py-8">No team members yet</p>
                                            ) : (
                                                members.map((member, index) => (
                                                    <motion.div
                                                        key={member.id}
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ duration: 0.2, delay: index * 0.05 }}
                                                    >
                                                        <Card className="border rounded-xl">
                                                            <CardContent className="p-4 flex items-center justify-between">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                                                        <span className="font-semibold text-indigo-700">
                                                                            {member.name.charAt(0).toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-semibold">{member.name}</p>
                                                                        <p className="text-sm text-muted-foreground">{member.email}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    {member.status === 'inactive' ? (
                                                                        <Badge variant="destructive" className="rounded-md">
                                                                            Inactive ({member.days_inactive}d)
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="secondary" className="rounded-md">
                                                                            Active
                                                                        </Badge>
                                                                    )}
                                                                    {member.email !== user?.email && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleRemoveMember(member.id, member.email)}
                                                                            className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    </motion.div>
                                                ))
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Info Box */}
                                <Card className="border-2 shadow-soft rounded-2xl bg-blue-50 mt-6">
                                    <CardContent className="p-6">
                                        <h3 className="font-semibold mb-2">Auto-enrollment Active</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Anyone who signs up with @{user?.email?.split('@')[1]} will automatically join your team workspace.
                                            Users inactive for 60+ days are automatically removed to optimize costs.
                                        </p>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}
                    </Tabs>
                </motion.div>
            </main>
        </div>
    );
};

export default TeamManagementPage;
