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
import { ArrowLeft, Crown, Check, Users, Lock, Palette, User, Save, HelpCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';
import OnboardingPopup from '@/components/OnboardingPopup';

const SettingsPage = () => {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [upgrading, setUpgrading] = React.useState(null);
    const [showPasswordDialog, setShowPasswordDialog] = React.useState(false);
    const [passwordForm, setPasswordForm] = React.useState({ current: '', new: '', confirm: '' });
    const [changingPassword, setChangingPassword] = React.useState(false);
    const [theme, setTheme] = React.useState('light');
    const [slackWebhook, setSlackWebhook] = React.useState('');
    const [savingSlack, setSavingSlack] = React.useState(false);
    const [testingSlack, setTestingSlack] = React.useState(false);
    const [displayName, setDisplayName] = React.useState('');
    const [savingName, setSavingName] = React.useState(false);
    const [showHowItWorks, setShowHowItWorks] = React.useState(false);
    // End-of-day report preferences
    const [eodEnabled, setEodEnabled] = React.useState(false);
    const [eodHour, setEodHour] = React.useState(17);
    const [eodChannel, setEodChannel] = React.useState('email');
    const [eodSaving, setEodSaving] = React.useState(false);
    const [eodPreviewing, setEodPreviewing] = React.useState(false);

    React.useEffect(() => {
        fetchPreferences();
        if (user?.name) setDisplayName(user.name);
    }, [user]);

    const fetchPreferences = async () => {
        try {
            const response = await axios.get(`${API}/auth/preferences`);
            setTheme(response.data.theme || 'light');
            setSlackWebhook(response.data.slack_webhook_url || '');
            setEodEnabled(Boolean(response.data.eod_enabled));
            setEodHour(response.data.eod_hour ?? 17);
            setEodChannel(response.data.eod_channel || 'email');
            document.documentElement.setAttribute('data-theme', response.data.theme || 'light');
        } catch (error) {
            console.error('Failed to fetch preferences');
        }
    };

    const saveEod = async (patch = {}) => {
        setEodSaving(true);
        try {
            const body = { eod_enabled: eodEnabled, eod_hour: eodHour, eod_channel: eodChannel, ...patch };
            await axios.put(`${API}/auth/preferences`, body);
            if (patch.eod_enabled !== undefined) setEodEnabled(patch.eod_enabled);
            if (patch.eod_hour !== undefined) setEodHour(patch.eod_hour);
            if (patch.eod_channel !== undefined) setEodChannel(patch.eod_channel);
            toast.success('EOD settings saved');
        } catch { toast.error('Failed to save EOD settings'); }
        finally { setEodSaving(false); }
    };

    const previewEod = async () => {
        setEodPreviewing(true);
        try {
            const res = await axios.post(`${API}/eod/preview`);
            if (res.data?.sent) toast.success(`EOD preview sent to your ${(res.data.delivered_to || []).join(' + ') || 'inbox'}`);
            else toast.info(res.data?.reason || 'Nothing to summarize yet');
        } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to send preview'); }
        finally { setEodPreviewing(false); }
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

    const saveSlack = async (opts = {}) => {
        const raw = (opts.value != null ? opts.value : slackWebhook).trim();
        setSavingSlack(true);
        try {
            await axios.put(`${API}/auth/preferences`, { slack_webhook_url: raw });
            if (opts.silent) return true;
            toast.success(raw ? 'Slack connected 🎉' : 'Slack disconnected');
            return true;
        } catch { toast.error('Failed to save'); return false; }
        finally { setSavingSlack(false); }
    };

    // Auto-connect if the user pastes a valid Slack webhook URL
    const handleSlackInput = (val) => {
        setSlackWebhook(val);
        const clean = (val || '').trim();
        const isSlackUrl = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9\/_-]+$/.test(clean);
        if (isSlackUrl) {
            // Auto-save silently — one less click for the user
            saveSlack({ value: clean, silent: true }).then((ok) => { if (ok) toast.success('Slack connected 🎉'); });
        }
    };

    const testSlack = async () => {
        if (!slackWebhook.trim()) { toast.error('Paste your webhook URL first'); return; }
        setTestingSlack(true);
        try {
            await axios.post(`${API}/integrations/slack/test`, { webhook_url: slackWebhook.trim() });
            toast.success('Test message sent to Slack ✅');
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Slack test failed');
        } finally { setTestingSlack(false); }
    };

    const handleNameUpdate = async () => {
        if (!displayName.trim()) {
            toast.error('Name cannot be empty');
            return;
        }
        setSavingName(true);
        try {
            await axios.put(`${API}/auth/profile`, { name: displayName.trim() });
            toast.success('Name updated');
            if (refreshUser) refreshUser();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update name'));
        } finally {
            setSavingName(false);
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
            window.location.href = response.data.url;
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to create checkout session'));
            setUpgrading(null);
        }
    };

    const features = {
        free: [
            'Unlimited tasks',
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
            'File & image attachments',
            'Assign to anyone'
        ],
        teams: [
            'Everything in Pro',
            'Team workspace (domain-based)',
            'Collaborate within company only',
            'Team analytics dashboard',
            'Shared task visibility',
            'Admin controls',
            'Dedicated account manager',
            'Export reports (Coming Soon)',
            'API integrations (Coming Soon)'
        ]
    };

    return (
        <div data-testid="settings-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            <AnimatePresence>
                {showHowItWorks && <OnboardingPopup page="howItWorks" onClose={() => setShowHowItWorks(false)} />}
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
                        Back to Hub
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setShowHowItWorks(true)}
                        className="rounded-full"
                    >
                        <HelpCircle className="w-4 h-4 mr-2" />
                        How Tskflow Works
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
                        <h1 className="text-5xl font-bold mb-2 text-foreground" style={{ fontFamily: 'Outfit' }}>Settings</h1>
                        <p className="text-muted-foreground text-lg">Manage your account and subscription</p>
                    </div>

                    {/* Profile Section */}
                    <Card className="border-2 shadow-soft rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-2xl flex items-center gap-2 text-foreground" style={{ fontFamily: 'Outfit' }}>
                                <User className="w-6 h-6" />
                                Profile
                            </CardTitle>
                            <CardDescription>Update your display name</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-end gap-3">
                                <div className="flex-1 space-y-2">
                                    <Label htmlFor="displayName" className="text-foreground">Display Name</Label>
                                    <Input
                                        id="displayName"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="Enter your name"
                                        className="rounded-xl"
                                    />
                                </div>
                                <Button
                                    onClick={handleNameUpdate}
                                    disabled={savingName || displayName === user?.name}
                                    className="rounded-full"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {savingName ? 'Saving...' : 'Save'}
                                </Button>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Email</p>
                                <p className="font-semibold text-foreground">{user?.email}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-2 shadow-soft rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-2xl text-foreground" style={{ fontFamily: 'Outfit' }}>Account Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Name</p>
                                <p className="font-semibold text-lg text-foreground">{user?.name}</p>
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
                                {user?.subscription_tier === 'free' && (
                                    <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles className="w-5 h-5 text-green-600" />
                                            <span className="font-semibold text-green-800">Try Teams Free for 30 Days</span>
                                        </div>
                                        <p className="text-sm text-green-700 mb-3">
                                            Get unlimited team members, performance leaderboards, and admin controls.
                                        </p>
                                        <Button
                                            onClick={async () => {
                                                try {
                                                    await axios.post(`${API}/start-teams-trial`);
                                                    toast.success('Teams trial started! Refresh to see changes.');
                                                    refreshUser();
                                                } catch (e) {
                                                    toast.error(e.response?.data?.detail || 'Failed to start trial');
                                                }
                                            }}
                                            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-full"
                                        >
                                            Start Free Trial
                                        </Button>
                                    </div>
                                )}
                                {user?.is_trial && user?.trial_ends && (
                                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                        <p className="text-sm text-amber-800">
                                            <strong>Trial ends:</strong> {new Date(user.trial_ends).toLocaleDateString()}
                                        </p>
                                    </div>
                                )}
                                {/* Google Calendar Connection */}
                                <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-semibold text-blue-900">Google Calendar</h4>
                                            <p className="text-sm text-blue-700">Auto-block time for urgent tasks</p>
                                        </div>
                                        {user?.google_calendar_connected ? (
                                            <Button
                                                onClick={async () => {
                                                    try {
                                                        await axios.delete(`${API}/auth/google/disconnect`);
                                                        toast.success('Calendar disconnected');
                                                        refreshUser();
                                                    } catch (e) {
                                                        toast.error('Failed to disconnect');
                                                    }
                                                }}
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full border-green-500 text-green-700"
                                            >
                                                <Check className="w-4 h-4 mr-1" /> Connected
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={async () => {
                                                    try {
                                                        const res = await axios.get(`${API}/auth/google/connect`);
                                                        window.location.href = res.data.auth_url;
                                                    } catch (e) {
                                                        toast.error('Failed to connect');
                                                    }
                                                }}
                                                size="sm"
                                                className="rounded-full bg-blue-600 hover:bg-blue-700"
                                            >
                                                Connect Calendar
                                            </Button>
                                        )}
                                    </div>
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
                                {(user?.subscription_tier === 'pro' || (user?.subscription_tier === 'teams' && user?.is_team_owner)) && (
                                    <Button
                                        onClick={async () => {
                                            try {
                                                const res = await axios.post(`${API}/create-portal-session`);
                                                window.location.href = res.data.url;
                                            } catch (e) {
                                                toast.error('Unable to open subscription portal');
                                            }
                                        }}
                                        variant="outline"
                                        className="mt-3 rounded-full"
                                    >
                                        <Crown className="w-4 h-4 mr-2" />
                                        Manage Subscription
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

                    {/* End-of-day report */}
                    <div className="bg-white/70 border-2 rounded-2xl p-6 space-y-4" data-testid="eod-settings-card">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg">🌇</span>
                            <div className="flex-1">
                                <h3 className="font-semibold text-base">End-of-day report</h3>
                                <p className="text-xs text-muted-foreground">Get a daily digest of what you completed, what&apos;s still open, and what you missed.</p>
                            </div>
                            <label className="inline-flex items-center gap-2 cursor-pointer" data-testid="eod-enabled-toggle">
                                <input
                                    type="checkbox"
                                    checked={eodEnabled}
                                    onChange={(e) => { setEodEnabled(e.target.checked); saveEod({ eod_enabled: e.target.checked }); }}
                                    className="sr-only peer"
                                />
                                <span className="w-11 h-6 bg-gray-200 rounded-full relative peer-checked:bg-amber-500 transition-colors">
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${eodEnabled ? 'translate-x-5' : ''}`}></span>
                                </span>
                            </label>
                        </div>
                        {eodEnabled && (
                            <div className="space-y-3 pt-2 border-t">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Delivery time (PST)</Label>
                                        <select
                                            value={eodHour}
                                            onChange={(e) => { const h = parseInt(e.target.value, 10); setEodHour(h); saveEod({ eod_hour: h }); }}
                                            className="mt-1 w-full px-3 py-2 border-2 rounded-xl text-sm bg-white focus:border-amber-500 focus:outline-none"
                                            data-testid="eod-hour-select"
                                        >
                                            {Array.from({ length: 24 }, (_, i) => (
                                                <option key={i} value={i}>{i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Send it via</Label>
                                        <select
                                            value={eodChannel}
                                            onChange={(e) => { const v = e.target.value; setEodChannel(v); saveEod({ eod_channel: v }); }}
                                            className="mt-1 w-full px-3 py-2 border-2 rounded-xl text-sm bg-white focus:border-amber-500 focus:outline-none"
                                            data-testid="eod-channel-select"
                                        >
                                            <option value="email">📧 Email</option>
                                            <option value="slack">💬 Slack {slackWebhook ? '' : '(connect Slack first)'}</option>
                                            <option value="both">📧 + 💬 Both</option>
                                        </select>
                                        {(eodChannel === 'slack' || eodChannel === 'both') && !slackWebhook && (
                                            <p className="text-xs text-amber-700 mt-1">⚠️ Slack channel selected but no webhook connected. Connect Slack below to receive there.</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button size="sm" variant="outline" onClick={previewEod} disabled={eodPreviewing || eodSaving} className="rounded-lg" data-testid="eod-preview-btn">
                                        {eodPreviewing ? 'Sending...' : '📨 Send me a preview now'}
                                    </Button>
                                    <p className="text-xs text-muted-foreground">You can override the schedule any time by hitting preview.</p>
                                </div>
                                <details className="rounded-xl border bg-gray-50/60 group">
                                    <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-medium flex items-center justify-between hover:bg-gray-100 rounded-xl">
                                        <span>What&apos;s inside the EOD report?</span>
                                        <span className="text-xs text-muted-foreground">Expand</span>
                                    </summary>
                                    <ul className="px-5 pb-4 pt-1 text-xs text-gray-700 space-y-1 list-disc ml-4">
                                        <li>Tasks you <strong>completed today</strong></li>
                                        <li>Tasks that are <strong>still open</strong></li>
                                        <li>Tasks that <strong>missed their due date</strong> (with a warning banner)</li>
                                        <li>A link back to your dashboard so you can jump in and finish</li>
                                    </ul>
                                </details>
                            </div>
                        )}
                    </div>

                    {/* Smart Reminders */}
                    <SmartRemindersCard slackConnected={!!slackWebhook} />

                    {/* Slack Bridge — Simple 1-click setup */}
                    <div className="bg-white/70 border-2 rounded-2xl p-6 space-y-4" data-testid="slack-settings-card">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-[#4A154B] text-white flex items-center justify-center font-bold text-lg">S</span>
                            <div className="flex-1">
                                <h3 className="font-semibold text-base">Slack notifications</h3>
                                <p className="text-xs text-muted-foreground">Get @mentions, EOD summaries and reminders in Slack.</p>
                            </div>
                            {slackWebhook && (
                                <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
                                </span>
                            )}
                        </div>

                        {!slackWebhook ? (
                            <div className="space-y-3">
                                {/* Big one-click button */}
                                <a
                                    href="https://api.slack.com/apps?new_app=1"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-3 w-full py-3.5 px-4 rounded-xl bg-[#4A154B] hover:bg-[#611f5f] text-white font-semibold transition-colors shadow-sm"
                                    data-testid="slack-connect-btn"
                                >
                                    <svg width="20" height="20" viewBox="0 0 122.8 122.8" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                        <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#e01e5a"/>
                                        <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36c5f0"/>
                                        <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2eb67d"/>
                                        <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ecb22e"/>
                                    </svg>
                                    Open Slack &amp; create a webhook
                                </a>

                                <details className="rounded-xl border bg-gray-50/60 group">
                                    <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium flex items-center justify-between hover:bg-gray-100 rounded-xl">
                                        <span>Show me how (30 seconds)</span>
                                        <span className="text-xs text-muted-foreground group-open:hidden">Expand</span>
                                        <span className="text-xs text-muted-foreground hidden group-open:inline">Collapse</span>
                                    </summary>
                                    <ol className="px-5 pb-4 pt-2 text-sm text-gray-700 space-y-2 list-decimal ml-4">
                                        <li>On Slack&apos;s page, click <strong>&quot;Create New App&quot;</strong> → <strong>From scratch</strong>, name it <em>Tskflow</em>, pick your workspace.</li>
                                        <li>In the sidebar, click <strong>Incoming Webhooks</strong> → toggle it <strong>On</strong>.</li>
                                        <li>Click <strong>&quot;Add New Webhook to Workspace&quot;</strong> and choose the channel you want messages in.</li>
                                        <li>Copy the webhook URL that starts with <code className="bg-white px-1 py-0.5 rounded text-xs">https://hooks.slack.com/services/...</code></li>
                                        <li>Paste it below — it&apos;ll connect automatically. That&apos;s it! 🎉</li>
                                    </ol>
                                </details>

                                <div>
                                    <Label htmlFor="slack-webhook" className="text-xs text-muted-foreground">Paste your webhook URL</Label>
                                    <div className="flex flex-col sm:flex-row gap-2 mt-1">
                                        <input
                                            id="slack-webhook"
                                            type="url"
                                            placeholder="https://hooks.slack.com/services/T0.../B0.../..."
                                            value={slackWebhook}
                                            onChange={(e) => handleSlackInput(e.target.value)}
                                            onPaste={(e) => {
                                                // Handle paste directly to auto-connect on next tick with the pasted value
                                                setTimeout(() => handleSlackInput(e.target.value), 0);
                                            }}
                                            className="flex-1 px-3 py-2.5 border-2 rounded-xl text-sm bg-white focus:border-indigo-500 focus:outline-none font-mono"
                                            data-testid="slack-webhook-input"
                                        />
                                        {slackWebhook.trim() && !slackWebhook.startsWith('https://hooks.slack.com/') ? null : (
                                            <Button size="sm" onClick={() => saveSlack()} disabled={savingSlack || !slackWebhook.trim().startsWith('https://hooks.slack.com/')} className="rounded-xl px-4" data-testid="slack-save-btn">
                                                {savingSlack ? 'Connecting...' : 'Connect'}
                                            </Button>
                                        )}
                                    </div>
                                    {slackWebhook && !slackWebhook.startsWith('https://hooks.slack.com/') && (
                                        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                                            <span>⚠️</span> Doesn&apos;t look like a Slack URL — should start with <code className="bg-red-50 px-1 rounded">https://hooks.slack.com/</code>
                                        </p>
                                    )}
                                    {slackWebhook.startsWith('https://hooks.slack.com/') && (
                                        <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                                            <span>✓</span> Looks good! Auto-connecting...
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                                        <Check className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-emerald-900">Slack is connected</p>
                                        <p className="text-xs text-emerald-700 truncate font-mono mt-0.5">{slackWebhook.replace(/(https:\/\/hooks\.slack\.com\/services\/)([^/]+\/[^/]+)\/.*/, '$1$2/••••••')}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    <Button variant="outline" size="sm" onClick={testSlack} disabled={testingSlack} data-testid="slack-test-btn" className="rounded-lg">
                                        {testingSlack ? 'Sending test...' : '📨 Send test message'}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={async () => { const ok = await saveSlack({ value: '', silent: true }); if (ok) { setSlackWebhook(''); toast.success('Slack disconnected'); } }} className="text-red-600 border-red-200 hover:bg-red-50 rounded-lg">
                                        Disconnect
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Feedback Link */}
                    <div className="text-center">
                        <a 
                            href="mailto:hashim@unbiassly.com?subject=Tskflow Feedback" 
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            Report a Bug / Send Feedback
                        </a>
                    </div>

                    {/* Deactivate Account */}
                    <div className="text-center pt-8 border-t">
                        <Button
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={async () => {
                                if (window.confirm('Are you sure? This will permanently delete your account, all tasks, and cancel any subscriptions.')) {
                                    try {
                                        await axios.delete(`${API}/auth/deactivate`);
                                        localStorage.removeItem('token');
                                        window.location.href = '/';
                                    } catch (e) {
                                        toast.error('Failed to deactivate account');
                                    }
                                }
                            }}
                        >
                            Deactivate Account
                        </Button>
                    </div>

                    {!(user?.subscription_tier === 'teams' && !user?.is_team_owner) && (
                    <div>
                        <h2 className="text-3xl font-bold mb-6 text-center text-foreground" style={{ fontFamily: 'Outfit' }}>Subscription Plans</h2>
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
                    )}
                </motion.div>
            </main>
        </div>
    );
};

export default SettingsPage;

// -------- Smart Reminders card --------
const SmartRemindersCard = ({ slackConnected }) => {
    const [rule, setRule] = React.useState({
        enabled: true,
        triggers: ['time_before_due', 'no_response', 'overdue'],
        hours_before_due: 4,
        frequency_hours: 12,
        channels: ['in_app', 'email'],
        priorities: ['High', 'Urgent'],
    });
    const [saving, setSaving] = React.useState(false);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        (async () => {
            try {
                const r = await axios.get(`${API}/reminders/rules`);
                setRule({ ...rule, ...(r.data?.rules || {}) });
            } catch (_) { /* noop */ } finally { setLoading(false); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const save = async (patch) => {
        const next = { ...rule, ...patch };
        setRule(next);
        setSaving(true);
        try {
            await axios.put(`${API}/reminders/rules`, next);
        } catch (_) { toast.error('Failed to save reminders'); }
        finally { setSaving(false); }
    };

    const toggleFrom = (list, item) => list.includes(item) ? list.filter(x => x !== item) : [...list, item];

    if (loading) return <div className="bg-white/70 border-2 rounded-2xl p-6 text-sm text-muted-foreground">Loading reminders…</div>;

    const triggerOpts = [
        { key: 'time_before_due', label: 'Time before due', help: 'Ping X hours before a task is due.' },
        { key: 'approaching_deadline', label: 'Approaching deadline', help: 'Extra nudge as the deadline gets very close.' },
        { key: 'no_response', label: 'No response after assignment', help: 'Fire when a Pending task hasn\u2019t been accepted for a while.' },
        { key: 'no_progress', label: 'No progress', help: 'Fire when an Accepted task has been idle before the deadline.' },
        { key: 'overdue', label: 'Overdue', help: 'Keep reminding when the task has passed its due date.' },
    ];

    return (
        <div className="bg-white/70 border-2 rounded-2xl p-6 space-y-4" data-testid="reminders-settings-card">
            <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center text-lg">⏰</span>
                <div className="flex-1">
                    <h3 className="font-semibold text-base">Smart Reminders</h3>
                    <p className="text-xs text-muted-foreground">Automated reminders for High and Urgent tasks — so nothing important goes cold.</p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rule.enabled} onChange={(e) => save({ enabled: e.target.checked })} className="sr-only peer" data-testid="reminders-enable-toggle" />
                    <span className="w-11 h-6 bg-gray-200 rounded-full relative peer-checked:bg-rose-500 transition-colors">
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${rule.enabled ? 'translate-x-5' : ''}`}></span>
                    </span>
                </label>
            </div>
            {rule.enabled && (
                <div className="space-y-4 pt-2 border-t">
                    <div>
                        <Label className="text-xs text-muted-foreground">Triggers</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                            {triggerOpts.map((t) => (
                                <label key={t.key} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${rule.triggers.includes(t.key) ? 'bg-rose-50 border-rose-200' : 'bg-white hover:bg-slate-50'}`} data-testid={`reminder-trigger-${t.key}`}>
                                    <input
                                        type="checkbox"
                                        checked={rule.triggers.includes(t.key)}
                                        onChange={() => save({ triggers: toggleFrom(rule.triggers, t.key) })}
                                        className="mt-0.5"
                                    />
                                    <div className="text-sm">
                                        <div className="font-medium">{t.label}</div>
                                        <div className="text-[11px] text-muted-foreground">{t.help}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs text-muted-foreground">Hours before due (time-before trigger)</Label>
                            <Input
                                type="number"
                                min={1}
                                max={72}
                                value={rule.hours_before_due}
                                onChange={(e) => save({ hours_before_due: parseInt(e.target.value || '1', 10) })}
                                className="rounded-xl mt-1"
                                data-testid="reminder-hours-before"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Minimum hours between reminders</Label>
                            <Input
                                type="number"
                                min={1}
                                max={72}
                                value={rule.frequency_hours}
                                onChange={(e) => save({ frequency_hours: parseInt(e.target.value || '1', 10) })}
                                className="rounded-xl mt-1"
                                data-testid="reminder-frequency"
                            />
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Deliver via</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {[
                                { key: 'in_app', label: '🔔 In-app + browser' },
                                { key: 'email', label: '📧 Email' },
                                { key: 'slack', label: '💬 Slack' + (slackConnected ? '' : ' (connect Slack first)') },
                            ].map((c) => (
                                <button
                                    type="button"
                                    key={c.key}
                                    onClick={() => save({ channels: toggleFrom(rule.channels, c.key) })}
                                    disabled={c.key === 'slack' && !slackConnected}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${rule.channels.includes(c.key) ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-rose-300'} disabled:opacity-40`}
                                    data-testid={`reminder-channel-${c.key}`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs text-muted-foreground">Apply to priorities</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {['Low', 'Medium', 'High', 'Urgent'].map((p) => (
                                <button
                                    type="button"
                                    key={p}
                                    onClick={() => save({ priorities: toggleFrom(rule.priorities, p) })}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${rule.priorities.includes(p) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'}`}
                                    data-testid={`reminder-priority-${p}`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                    {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
                </div>
            )}
        </div>
    );
};