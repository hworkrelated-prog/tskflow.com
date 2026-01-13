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
import { toast } from 'sonner';
import { ArrowLeft, UserPlus, Trash2, DollarSign, Users as UsersIcon } from 'lucide-react';
import { motion } from 'framer-motion';

const TeamManagementPage = () => {
    const { user } = useAuth();
    const [members, setMembers] = useState([]);
    const [billing, setBilling] = useState(null);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviting, setInviting] = useState(false);
    const [showInviteDialog, setShowInviteDialog] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (!user?.is_team_owner) {
            navigate('/settings');
            return;
        }
        fetchTeamData();
    }, [user]);

    const fetchTeamData = async () => {
        try {
            const [membersRes, billingRes] = await Promise.all([
                axios.get(`${API}/team/members`),
                axios.get(`${API}/team/billing`)
            ]);
            setMembers(membersRes.data);
            setBilling(billingRes.data);
        } catch (error) {
            toast.error('Failed to load team data');
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
            fetchTeamData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to send invitation');
        } finally {
            setInviting(false);
        }
    };

    const handleRemoveMember = async (memberId, memberEmail) => {
        if (!window.confirm(`Remove ${memberEmail} from team?`)) return;

        try {
            await axios.delete(`${API}/team/members/${memberId}`);
            toast.success('Member removed from team');
            fetchTeamData();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to remove member');
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
                        variant="ghost"
                        onClick={() => navigate('/settings')}
                        className="rounded-full"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Settings
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
                        <h1 className="text-5xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>Team Management</h1>
                        <p className="text-muted-foreground text-lg">Manage your team workspace and billing</p>
                    </div>

                    {/* Billing Card */}
                    <Card className="border-2 shadow-soft rounded-2xl">
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
                                        Team Members
                                    </CardTitle>
                                    <CardDescription>People on your {user?.company_domain} workspace</CardDescription>
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
                                                    placeholder={`name@${user?.company_domain}`}
                                                    value={inviteEmail}
                                                    onChange={(e) => setInviteEmail(e.target.value)}
                                                    required
                                                    className="rounded-xl"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Must be from {user?.company_domain} domain
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
                    <Card className="border-2 shadow-soft rounded-2xl bg-blue-50">
                        <CardContent className="p-6">
                            <h3 className="font-semibold mb-2">Auto-enrollment Active</h3>
                            <p className="text-sm text-muted-foreground">
                                Anyone who signs up with @{user?.company_domain} will automatically join your team workspace.
                                Users inactive for 60+ days are automatically removed to optimize costs.
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>
            </main>
        </div>
    );
};

export default TeamManagementPage;
