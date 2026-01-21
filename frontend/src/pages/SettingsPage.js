import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API } from '@/App';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Crown, Check, Users, Lock, Palette } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const SettingsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [upgrading, setUpgrading] = React.useState(null);
    const [showPasswordDialog, setShowPasswordDialog] = React.useState(false);
    const [passwordForm, setPasswordForm] = React.useState({ current: '', new: '', confirm: '' });
    const [changingPassword, setChangingPassword] = React.useState(false);
    const [theme, setTheme] = React.useState('light');

    React.useEffect(() => {
        fetchPreferences();
    }, []);

    const fetchPreferences = async () => {
        try {
            const response = await axios.get(`${API}/auth/preferences`);
            setTheme(response.data.theme || 'light');
            document.documentElement.setAttribute('data-theme', response.data.theme || 'light');
        } catch (error) {
            console.error('Failed to fetch preferences');
        }
    };

    const handleThemeChange = async (newTheme) => {
        try {
            await axios.put(`${API}/auth/preferences`, { theme: newTheme });
            setTheme(newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
            toast.success('Theme updated');
        } catch (error) {
            toast.error('Failed to update theme');
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        
        if (passwordForm.new !== passwordForm.confirm) {
            toast.error('New passwords do not match');
            return;
        }

        setChangingPassword(true);
        try {
            await axios.post(`${API}/auth/change-password`, {
                current_password: passwordForm.current,
                new_password: passwordForm.new
            });
            toast.success('Password changed successfully');
            setShowPasswordDialog(false);
            setPasswordForm({ current: '', new: '', confirm: '' });
        } catch (error) {
            const errorMsg = error.response?.data?.detail;
            if (Array.isArray(errorMsg)) {
                // Pydantic validation errors
                toast.error(errorMsg[0]?.msg || 'Password validation failed');
            } else if (typeof errorMsg === 'string') {
                toast.error(errorMsg);
            } else {
                toast.error('Failed to change password');
            }
        } finally {
            setChangingPassword(false);
        }
    };

    const handleUpgrade = async (packageType) => {
        setUpgrading(packageType);
        try {
            const response = await axios.post(`${API}/payments/create-checkout`, {
                package: packageType,
                origin_url: window.location.origin
            });
            
            // Redirect to Stripe checkout
            window.location.href = response.data.url;
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create checkout session');
            setUpgrading(null);
        }
    };

    const features = {
        free: [
            'Up to 5 active tasks',
            'Basic task management',
            'Email notifications',
            'Task analytics',
            'Assign to anyone'
        ],
        pro: [
            'Unlimited tasks',
            'Priority support',
            'Advanced analytics',
            'Custom categories',
            'Export reports',
            'Assign to anyone'
        ],
        teams: [
            'Everything in Pro',
            'Team workspace (domain-based)',
            'Collaborate within company only',
            'Team analytics dashboard',
            'Shared task visibility',
            'Admin controls',
            'Dedicated account manager'
        ]
    };

    return (
        <div data-testid="settings-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
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

            <main className="container mx-auto px-6 py-8 max-w-4xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-8"
                >
                    <div className="text-center">
                        <h1 className="text-5xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>Settings</h1>
                        <p className="text-muted-foreground text-lg">Manage your account and subscription</p>
                    </div>

                    <Card className="border-2 shadow-soft rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Account Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Name</p>
                                <p className="font-semibold text-lg">{user?.name}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Email</p>
                                <p className="font-semibold text-lg">{user?.email}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Current Plan</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {user?.subscription_tier === 'teams' ? (
                                        <Badge className="bg-indigo-600 text-white rounded-full px-3 py-1 text-sm font-semibold flex items-center gap-1">
                                            <Users className="w-4 h-4" />
                                            TEAMS
                                        </Badge>
                                    ) : user?.subscription_tier === 'pro' ? (
                                        <Badge className="subscription-badge-pro rounded-full px-3 py-1 text-sm font-semibold flex items-center gap-1">
                                            <Crown className="w-4 h-4" />
                                            PRO
                                        </Badge>
                                    ) : (
                                        <Badge className="subscription-badge-free rounded-full px-3 py-1 text-sm font-semibold">
                                            FREE
                                        </Badge>
                                    )}
                                </div>
                                {user?.subscription_tier === 'teams' && (
                                    <Button
                                        onClick={() => navigate('/team')}
                                        variant="outline"
                                        className="mt-3 rounded-full"
                                    >
                                        <Users className="w-4 h-4 mr-2" />
                                        {user?.is_team_owner ? 'Manage Team' : 'My Team & Reports'}
                                    </Button>
                                )}
                                {user?.subscription_tier === 'teams' && !user?.is_team_owner && user?.team_owner_email && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Team Owner: {user?.team_owner_email}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Password Change */}
                        <Card className="border-2 shadow-soft rounded-2xl">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <Lock className="w-5 h-5" />
                                    Security
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="rounded-full w-full">
                                            Change Password
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="rounded-2xl">
                                        <DialogHeader>
                                            <DialogTitle>Change Password</DialogTitle>
                                            <DialogDescription>Update your account password</DialogDescription>
                                        </DialogHeader>
                                        <form onSubmit={handlePasswordChange} className="space-y-4 pt-4">
                                            <div className="space-y-2">
                                                <Label>Current Password</Label>
                                                <Input
                                                    type="password"
                                                    value={passwordForm.current}
                                                    onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})}
                                                    required
                                                    className="rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>New Password</Label>
                                                <Input
                                                    type="password"
                                                    value={passwordForm.new}
                                                    onChange={(e) => setPasswordForm({...passwordForm, new: e.target.value})}
                                                    required
                                                    className="rounded-xl"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Min 8 characters, 1 uppercase, 1 lowercase, 1 number
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Confirm New Password</Label>
                                                <Input
                                                    type="password"
                                                    value={passwordForm.confirm}
                                                    onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})}
                                                    required
                                                    className="rounded-xl"
                                                />
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <Button type="button" variant="outline" onClick={() => setShowPasswordDialog(false)} className="rounded-full">
                                                    Cancel
                                                </Button>
                                                <Button type="submit" disabled={changingPassword} className="rounded-full">
                                                    {changingPassword ? 'Updating...' : 'Update Password'}
                                                </Button>
                                            </div>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </CardContent>
                        </Card>

                        {/* Theme Selection */}
                        <Card className="border-2 shadow-soft rounded-2xl">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <Palette className="w-5 h-5" />
                                    Appearance
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {['light', 'dark', 'minimal'].map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => handleThemeChange(t)}
                                        className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                                            theme === t ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium capitalize">{t}</span>
                                            {theme === t && <Check className="w-5 h-5 text-primary" />}
                                        </div>
                                    </button>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    <div>
                        <h2 className="text-3xl font-bold mb-6 text-center" style={{ fontFamily: 'Outfit' }}>Subscription Plans</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Free Plan */}
                            <Card className={`border-2 rounded-2xl ${
                                user?.subscription_tier === 'free' 
                                    ? 'border-primary shadow-lg' 
                                    : 'border-border shadow-soft'
                            }`}>
                                <CardHeader>
                                    <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Free</CardTitle>
                                    <CardDescription>
                                        <span className="text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>$0</span>
                                        <span className="text-muted-foreground">/month</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ul className="space-y-3">
                                        {features.free.map((feature, index) => (
                                            <li key={index} className="flex items-center gap-2">
                                                <Check className="w-5 h-5 text-green-600" />
                                                <span className="text-sm">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {user?.subscription_tier === 'free' && (
                                        <Badge className="w-full justify-center py-2 rounded-full">
                                            Current Plan
                                        </Badge>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Pro Plan */}
                            <Card className={`border-2 rounded-2xl ${
                                user?.subscription_tier === 'pro' 
                                    ? 'border-primary shadow-lg' 
                                    : 'border-border shadow-soft'
                            }`}>
                                <CardHeader>
                                    <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                        <Crown className="w-6 h-6 text-amber-500" />
                                        Pro
                                    </CardTitle>
                                    <CardDescription>
                                        <span className="text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>$9</span>
                                        <span className="text-muted-foreground">/month</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ul className="space-y-3">
                                        {features.pro.map((feature, index) => (
                                            <li key={index} className="flex items-center gap-2">
                                                <Check className="w-5 h-5 text-green-600" />
                                                <span className="text-sm">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {user?.subscription_tier === 'pro' ? (
                                        <Badge className="w-full justify-center py-2 rounded-full subscription-badge-pro">
                                            Current Plan
                                        </Badge>
                                    ) : (user?.subscription_tier === 'teams' && !user?.is_team_owner) ? (
                                        <Badge className="w-full justify-center py-2 rounded-full bg-gray-100 text-gray-600">
                                            Contact Team Owner
                                        </Badge>
                                    ) : (
                                        <Button 
                                            onClick={() => handleUpgrade('pro')}
                                            disabled={upgrading !== null}
                                            className="w-full rounded-full h-12 font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                                        >
                                            {upgrading === 'pro' ? 'Processing...' : 'Upgrade to Pro'}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Teams Plan */}
                            <Card className={`border-2 rounded-2xl ${
                                user?.subscription_tier === 'teams' 
                                    ? 'border-primary shadow-lg' 
                                    : 'border-border shadow-soft'
                            }`}>
                                <CardHeader>
                                    <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                        <Users className="w-6 h-6 text-indigo-600" />
                                        Teams
                                    </CardTitle>
                                    <CardDescription>
                                        <span className="text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>$12</span>
                                        <span className="text-muted-foreground">/user/month</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ul className="space-y-3">
                                        {features.teams.map((feature, index) => (
                                            <li key={index} className="flex items-center gap-2">
                                                <Check className="w-5 h-5 text-green-600" />
                                                <span className="text-sm">{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {user?.subscription_tier === 'teams' ? (
                                        <div className="space-y-2">
                                            <Badge className="w-full justify-center py-2 rounded-full bg-indigo-600 text-white">
                                                Current Plan
                                            </Badge>
                                            <p className="text-xs text-center text-muted-foreground">
                                                Domain: {user?.email?.split('@')[1]}
                                            </p>
                                        </div>
                                    ) : (user?.subscription_tier === 'teams' && !user?.is_team_owner) ? (
                                        <Badge className="w-full justify-center py-2 rounded-full bg-gray-100 text-gray-600">
                                            Contact Team Owner
                                        </Badge>
                                    ) : (
                                        <Button 
                                            onClick={() => handleUpgrade('teams')}
                                            disabled={upgrading !== null}
                                            className="w-full rounded-full h-12 font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            {upgrading === 'teams' ? 'Processing...' : 'Upgrade to Teams'}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </motion.div>
            </main>
        </div>
    );
};

export default SettingsPage;