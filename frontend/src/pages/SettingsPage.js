import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API } from '@/App';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Crown, Check, Users, Lock, Palette, User, Save, HelpCircle, Sparkles, Table2, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';
import { applyTheme } from '@/lib/theme';
import OnboardingPopup from '@/components/OnboardingPopup';

function IosSwitch({ checked, onChange, testId }) {
    return (
        <label className="ios-switch-wrap inline-flex items-center cursor-pointer shrink-0">
            <input
                type="checkbox"
                checked={!!checked}
                onChange={onChange}
                className="sr-only"
                data-testid={testId}
            />
            <span className={`ios-switch ${checked ? 'is-on' : ''}`} aria-hidden="true">
                <span className="ios-switch-knob theme-toggle-knob" />
            </span>
        </label>
    );
}

const SettingsPage = () => {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [upgrading, setUpgrading] = React.useState(null);
    const [showPasswordDialog, setShowPasswordDialog] = React.useState(false);
    const [passwordForm, setPasswordForm] = React.useState({ current: '', new: '', confirm: '' });
    const [changingPassword, setChangingPassword] = React.useState(false);
    const [theme, setTheme] = React.useState('light');
    const [slackWebhook, setSlackWebhook] = React.useState('');
    const [canManageSlack, setCanManageSlack] = React.useState(false);
    const [slackTeamConnected, setSlackTeamConnected] = React.useState(false);
    const [slackBotEnabled, setSlackBotEnabled] = React.useState(false);
    const [savingSlack, setSavingSlack] = React.useState(false);
    const [testingSlack, setTestingSlack] = React.useState(false);
    const [displayName, setDisplayName] = React.useState('');
    const [savingName, setSavingName] = React.useState(false);
    const [showHowItWorks, setShowHowItWorks] = React.useState(false);
    // End-of-day report preferences
    const [eodEnabled, setEodEnabled] = React.useState(false);
    const [eodHour, setEodHour] = React.useState(17);
    const [eodChannel, setEodChannel] = React.useState('email');
    const [eodDays, setEodDays] = React.useState([0, 1, 2, 3, 4, 5, 6]);
    const [eodSections, setEodSections] = React.useState({
        completed: true,
        open: true,
        missed: true,
        manager_snapshot: true,
        suggested_plan: true,
        sheet_metrics: true,
    });
    const [eodSaving, setEodSaving] = React.useState(false);
    const [eodPreviewing, setEodPreviewing] = React.useState(false);
    const [hierarchyReviewFrequency, setHierarchyReviewFrequency] = React.useState('monthly');
    const [savingTeamChanges, setSavingTeamChanges] = React.useState(false);
    const [sheetConnected, setSheetConnected] = React.useState(false);
    const [sheetConfig, setSheetConfig] = React.useState(null);
    const [sheetForm, setSheetForm] = React.useState({
        spreadsheet_url: '',
        sheet_name: 'Sheet1',
        person_column: 'A',
        date_column: 'B',
        metrics: [
            { label: 'Calls', column: 'C', daily_target: 75 },
            { label: 'Emails', column: 'D', daily_target: 45 },
            { label: 'Salesforce tasks', column: 'E', daily_target: 10 },
        ],
    });
    const [savingSheet, setSavingSheet] = React.useState(false);
    const [syncingSheet, setSyncingSheet] = React.useState(false);

    const loadSheetConfig = React.useCallback(async () => {
        try {
            const res = await axios.get(`${API}/sheets/config`);
            setSheetConnected(!!res.data.connected);
            const cfg = (res.data.configs || [])[0] || null;
            setSheetConfig(cfg);
            if (cfg) {
                setSheetForm({
                    spreadsheet_url: cfg.spreadsheet_url || cfg.spreadsheet_id || '',
                    sheet_name: cfg.sheet_name || 'Sheet1',
                    person_column: cfg.person_column || 'A',
                    date_column: cfg.date_column || 'B',
                    metrics: (cfg.metrics || []).map((m) => ({
                        label: m.label || m.key,
                        column: m.column,
                        daily_target: m.daily_target ?? '',
                    })),
                });
            }
        } catch (_) { /* silent */ }
    }, []);

    React.useEffect(() => {
        fetchPreferences();
        loadSheetConfig();
        if (user?.name) setDisplayName(user.name);
    }, [user]);

    const fetchPreferences = async () => {
        try {
            const response = await axios.get(`${API}/auth/preferences`);
            setTheme(response.data.theme || 'light');
            setSlackWebhook(response.data.slack_webhook_url || '');
            setCanManageSlack(Boolean(response.data.can_manage_slack));
            setSlackTeamConnected(Boolean(response.data.slack_team_connected));
            try {
                const slack = await axios.get(`${API}/integrations/slack/status`);
                setSlackBotEnabled(Boolean(slack.data?.bot || slack.data?.followup_enabled));
            } catch (_) { /* optional */ }
            setEodEnabled(Boolean(response.data.eod_enabled));
            setEodHour(response.data.eod_hour ?? 17);
            setEodChannel(response.data.eod_channel || 'email');
            setEodDays(Array.isArray(response.data.eod_days) && response.data.eod_days.length
                ? response.data.eod_days.map(Number)
                : [0, 1, 2, 3, 4, 5, 6]);
            setEodSections({
                completed: true,
                open: true,
                missed: true,
                manager_snapshot: true,
                suggested_plan: true,
                sheet_metrics: true,
                ...(response.data.eod_sections || {}),
            });
            setHierarchyReviewFrequency(response.data.hierarchy_review_frequency || 'monthly');
            applyTheme(response.data.theme || 'light');
        } catch (error) {
            console.error('Failed to fetch preferences');
        }
    };

    const saveTeamChanges = async (value) => {
        setHierarchyReviewFrequency(value);
        setSavingTeamChanges(true);
        try {
            await axios.put(`${API}/auth/preferences`, { hierarchy_review_frequency: value });
            toast.success('Saved');
        } catch {
            toast.error('Failed to save');
        } finally {
            setSavingTeamChanges(false);
        }
    };

    const saveEod = async (patch = {}) => {
        setEodSaving(true);
        try {
            const body = {
                eod_enabled: eodEnabled,
                eod_hour: eodHour,
                eod_channel: eodChannel,
                eod_days: eodDays,
                eod_sections: eodSections,
                ...patch,
            };
            await axios.put(`${API}/auth/preferences`, body);
            if (patch.eod_enabled !== undefined) setEodEnabled(patch.eod_enabled);
            if (patch.eod_hour !== undefined) setEodHour(patch.eod_hour);
            if (patch.eod_channel !== undefined) setEodChannel(patch.eod_channel);
            if (patch.eod_days !== undefined) setEodDays(patch.eod_days);
            if (patch.eod_sections !== undefined) setEodSections(patch.eod_sections);
            toast.success('EOD settings saved');
        } catch { toast.error('Failed to save EOD settings'); }
        finally { setEodSaving(false); }
    };

    const toggleEodDay = (n) => {
        const on = eodDays.includes(n);
        let next = on ? eodDays.filter((d) => d !== n) : [...eodDays, n].sort((a, b) => a - b);
        if (!next.length) next = [5, 6]; // keep Saturday + Sunday
        setEodDays(next);
        saveEod({ eod_days: next });
    };

    const toggleEodSection = (key) => {
        const next = { ...eodSections, [key]: !eodSections[key] };
        setEodSections(next);
        saveEod({ eod_sections: next });
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
            applyTheme(newTheme);
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
            setSlackTeamConnected(Boolean(raw));
            if (opts.silent) return true;
            toast.success(raw ? 'Slack connected 🎉' : 'Slack disconnected');
            return true;
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Failed to save');
            return false;
        } finally { setSavingSlack(false); }
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
            'Assign to anyone by email',
            'Basic analytics',
            'Jarvis chat (core)',
            'Email notifications',
        ],
        pro: [
            'Everything in Free',
            'Smart reminders',
            'End-of-day summaries',
            'Attachments & screen recordings',
            'Sales task tagging',
            'Advanced analytics',
        ],
        teams: [
            'Everything in Pro',
            'Company domain workspace',
            'Org hierarchy & leaderboards',
            'Team analytics dashboard',
            'Slack follow-up for ignored tasks',
            'Admin controls',
            'Shared task visibility',
        ]
    };

    return (
        <div data-testid="settings-page" className="page-shell">
            <AnimatePresence>
                {showHowItWorks && <OnboardingPopup page="howItWorks" onClose={() => setShowHowItWorks(false)} />}
            </AnimatePresence>
            <header className="glass-header border-b">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <Button
                        data-testid="back-button"
                        variant="outline"
                        onClick={() => navigate('/dashboard')}
                        className="rounded-full border-border text-foreground hover:bg-muted hover:text-foreground"
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
                    <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Outfit' }}>Settings</h1>

                    {/* Profile Section */}
                    <Card className="border shadow-soft rounded-2xl">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2 text-foreground" style={{ fontFamily: 'Outfit' }}>
                                <User className="w-5 h-5" />
                                Profile
                            </CardTitle>
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

                    <Card className="border shadow-soft rounded-2xl">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg text-foreground" style={{ fontFamily: 'Outfit' }}>Account</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Name</p>
                                <p className="font-semibold text-foreground">{user?.name}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Email</p>
                                <p className="font-semibold">{user?.email}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Plan</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {user?.subscription_tier === 'teams' ? (
                                        <Badge className="bg-teal-600 text-white rounded-full px-3 py-1 text-sm font-semibold flex items-center gap-1">
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
                                <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-teal-50 border border-blue-200 rounded-xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-semibold text-blue-900">Google Calendar</h4>
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

                                {/* Google Sheets daily metrics — hidden until the connector scope is approved */}
                                {false && (
                                <div className="mt-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-3" data-testid="google-sheets-sync">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Table2 className="w-5 h-5 text-emerald-700" />
                                            <div>
                                                <h4 className="font-semibold text-emerald-900">Google Sheets activity sync</h4>
                                                <p className="text-xs text-emerald-800/80">Pull daily sales activity numbers into end-of-day reports and Jarvis answers</p>
                                            </div>
                                        </div>
                                        {sheetConnected || user?.google_sheets_connected ? (
                                            <Button
                                                onClick={async () => {
                                                    try {
                                                        await axios.delete(`${API}/auth/google/sheets/disconnect`);
                                                        toast.success('Sheets disconnected');
                                                        setSheetConnected(false);
                                                        refreshUser();
                                                        loadSheetConfig();
                                                    } catch (e) {
                                                        toast.error('Failed to disconnect');
                                                    }
                                                }}
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full border-green-500 text-green-700 shrink-0"
                                            >
                                                <Check className="w-4 h-4 mr-1" /> Connected
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={async () => {
                                                    try {
                                                        const res = await axios.get(`${API}/auth/google/sheets/connect`);
                                                        window.location.href = res.data.auth_url;
                                                    } catch (e) {
                                                        toast.error('Failed to connect Sheets');
                                                    }
                                                }}
                                                size="sm"
                                                className="rounded-full bg-emerald-600 hover:bg-emerald-700 shrink-0"
                                            >
                                                Connect Sheets
                                            </Button>
                                        )}
                                    </div>

                                    {(sheetConnected || user?.google_sheets_connected) && (
                                        <div className="space-y-3 pt-2 border-t border-emerald-200/80">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                <div className="sm:col-span-2">
                                                    <Label className="text-xs">Spreadsheet URL or ID</Label>
                                                    <Input
                                                        value={sheetForm.spreadsheet_url}
                                                        onChange={(e) => setSheetForm((f) => ({ ...f, spreadsheet_url: e.target.value }))}
                                                        placeholder="https://docs.google.com/spreadsheets/d/…"
                                                        className="rounded-lg mt-1"
                                                        data-testid="sheet-url-input"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Tab name</Label>
                                                    <Input
                                                        value={sheetForm.sheet_name}
                                                        onChange={(e) => setSheetForm((f) => ({ ...f, sheet_name: e.target.value }))}
                                                        className="rounded-lg mt-1"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-xs">Name column (letter)</Label>
                                                        <Input
                                                            value={sheetForm.person_column}
                                                            onChange={(e) => setSheetForm((f) => ({ ...f, person_column: e.target.value }))}
                                                            className="rounded-lg mt-1"
                                                            placeholder="A"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs">Date column (letter)</Label>
                                                        <Input
                                                            value={sheetForm.date_column}
                                                            onChange={(e) => setSheetForm((f) => ({ ...f, date_column: e.target.value }))}
                                                            className="rounded-lg mt-1"
                                                            placeholder="B"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs">Metric columns</Label>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-xs"
                                                        onClick={() => setSheetForm((f) => ({
                                                            ...f,
                                                            metrics: [...f.metrics, { label: '', column: '', daily_target: '' }],
                                                        }))}
                                                    >
                                                        <Plus className="w-3 h-3 mr-1" /> Add metric
                                                    </Button>
                                                </div>
                                                {sheetForm.metrics.map((m, idx) => (
                                                    <div key={idx} className="grid grid-cols-[1fr_60px_80px_32px] gap-1.5 items-end">
                                                        <Input
                                                            placeholder="Label (e.g. Calls)"
                                                            value={m.label}
                                                            onChange={(e) => {
                                                                const metrics = [...sheetForm.metrics];
                                                                metrics[idx] = { ...metrics[idx], label: e.target.value };
                                                                setSheetForm((f) => ({ ...f, metrics }));
                                                            }}
                                                            className="rounded-lg"
                                                        />
                                                        <Input
                                                            placeholder="Col"
                                                            value={m.column}
                                                            onChange={(e) => {
                                                                const metrics = [...sheetForm.metrics];
                                                                metrics[idx] = { ...metrics[idx], column: e.target.value };
                                                                setSheetForm((f) => ({ ...f, metrics }));
                                                            }}
                                                            className="rounded-lg"
                                                        />
                                                        <Input
                                                            type="number"
                                                            placeholder="Target"
                                                            value={m.daily_target}
                                                            onChange={(e) => {
                                                                const metrics = [...sheetForm.metrics];
                                                                metrics[idx] = { ...metrics[idx], daily_target: e.target.value };
                                                                setSheetForm((f) => ({ ...f, metrics }));
                                                            }}
                                                            className="rounded-lg"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-9 w-9 text-red-500"
                                                            onClick={() => setSheetForm((f) => ({
                                                                ...f,
                                                                metrics: f.metrics.filter((_, i) => i !== idx),
                                                            }))}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                                                    disabled={savingSheet}
                                                    data-testid="sheet-save-mapping"
                                                    onClick={async () => {
                                                        setSavingSheet(true);
                                                        try {
                                                            const payload = {
                                                                ...sheetForm,
                                                                metrics: sheetForm.metrics
                                                                    .filter((m) => m.label && m.column)
                                                                    .map((m) => ({
                                                                        label: m.label,
                                                                        column: m.column,
                                                                        daily_target: m.daily_target === '' ? null : Number(m.daily_target),
                                                                    })),
                                                            };
                                                            const res = await axios.post(`${API}/sheets/config`, payload);
                                                            setSheetConfig(res.data.config);
                                                            toast.success('Sheet mapping saved');
                                                        } catch (e) {
                                                            toast.error(getErrorMessage(e, 'Failed to save mapping'));
                                                        } finally {
                                                            setSavingSheet(false);
                                                        }
                                                    }}
                                                >
                                                    {savingSheet ? 'Saving…' : 'Save mapping'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="rounded-full"
                                                    disabled={syncingSheet}
                                                    data-testid="sheet-sync-now"
                                                    onClick={async () => {
                                                        setSyncingSheet(true);
                                                        try {
                                                            const res = await axios.post(`${API}/sheets/sync`);
                                                            toast.success(`Synced ${res.data.synced || 0} row(s)`);
                                                            loadSheetConfig();
                                                        } catch (e) {
                                                            toast.error(getErrorMessage(e, 'Sync failed'));
                                                        } finally {
                                                            setSyncingSheet(false);
                                                        }
                                                    }}
                                                >
                                                    <RefreshCw className={`w-4 h-4 mr-1 ${syncingSheet ? 'animate-spin' : ''}`} />
                                                    {syncingSheet ? 'Syncing…' : 'Sync now'}
                                                </Button>
                                            </div>
                                            {sheetConfig?.last_synced_at && (
                                                <p className="text-xs text-emerald-800/70">
                                                    Last sync: {new Date(sheetConfig.last_synced_at).toLocaleString()}
                                                    {sheetConfig.last_sync_count != null ? ` · ${sheetConfig.last_sync_count} rows` : ''}
                                                </p>
                                            )}
                                            {sheetConfig?.last_sync_error && (
                                                <p className="text-xs text-red-600">{sheetConfig.last_sync_error}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                )}
                                {(user?.subscription_tier === 'teams' || user?.subscription_tier === 'pro') && (
                                    <Button
                                        onClick={() => navigate('/team')}
                                        variant="outline"
                                        className="mt-3 rounded-full"
                                    >
                                        <Users className="w-4 h-4 mr-2" />
                                        {user?.subscription_tier === 'pro'
                                            ? 'Groups'
                                            : user?.is_team_owner
                                                ? 'Manage Team'
                                                : 'My Team & Reports'}
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
                            {user?.subscription_tier === 'teams' && (
                                <div className="pt-2 border-t space-y-1.5" data-testid="team-changes-preference">
                                    <Label htmlFor="team-changes" className="text-sm font-medium text-foreground">
                                        How often does your reporting line change?
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Used to remind you to confirm who you report to and who is on your team.
                                    </p>
                                    <select
                                        id="team-changes"
                                        value={hierarchyReviewFrequency}
                                        onChange={(e) => saveTeamChanges(e.target.value)}
                                        disabled={savingTeamChanges}
                                        className="mt-1 w-full sm:w-72 px-3 py-2 border border-input rounded-xl text-sm bg-background text-foreground focus:border-teal-500 focus:outline-none"
                                        data-testid="hierarchy-review-frequency"
                                    >
                                        <option value="weekly">Weekly — teams reshuffle often</option>
                                        <option value="monthly">Monthly — typical</option>
                                        <option value="quarterly">Quarterly — mostly stable</option>
                                        <option value="rarely">Rarely — org chart almost never changes</option>
                                    </select>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Password Change */}
                        <Card className="border shadow-soft rounded-2xl">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
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
                        <Card className="border shadow-soft rounded-2xl">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Palette className="w-5 h-5" />
                                    Appearance
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {[
                                    { id: 'light', label: 'Light', swatch: 'bg-[#f8fafc] border-slate-200' },
                                    { id: 'dark', label: 'Dark', swatch: 'bg-[#14161c] border-neutral-600' },
                                    { id: 'minimal', label: 'Minimal', swatch: 'bg-white border-neutral-300' },
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => handleThemeChange(t.id)}
                                        data-testid={`theme-option-${t.id}`}
                                        className={`w-full p-3 rounded-xl border text-left transition-all ${
                                            theme === t.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="flex items-center gap-3">
                                                <span className={`h-8 w-8 rounded-lg border ${t.swatch}`} aria-hidden />
                                                <span className="font-medium text-foreground">{t.label}</span>
                                            </span>
                                            {theme === t.id && <Check className="w-5 h-5 text-primary" />}
                                        </div>
                                    </button>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    {/* End-of-day report */}
                    <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 space-y-4" data-testid="eod-settings-card">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg">🌇</span>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-base">End-of-day report</h3>
                                <p className="text-xs text-muted-foreground">A short glance at what got done, who didn’t finish, and today’s leaderboard. Pick the days and Pacific time — Saturday and Sunday stay on unless you turn them off.</p>
                            </div>
                            <IosSwitch
                                checked={eodEnabled}
                                testId="eod-enabled-toggle"
                                onChange={(e) => { setEodEnabled(e.target.checked); saveEod({ eod_enabled: e.target.checked }); }}
                            />
                        </div>
                        {eodEnabled && (
                            <div className="space-y-3 pt-2 border-t">
                                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Delivery time (Pacific)</Label>
                                        <select
                                            value={eodHour}
                                            onChange={(e) => { const h = parseInt(e.target.value, 10); setEodHour(h); saveEod({ eod_hour: h }); }}
                                            className="mt-1 w-full px-3 py-2 border border-input rounded-xl text-sm bg-background text-foreground focus:border-amber-500 focus:outline-none"
                                            data-testid="eod-hour-select"
                                        >
                                            {Array.from({ length: 24 }, (_, i) => (
                                                <option key={i} value={i}>{i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Where to send it</Label>
                                        <select
                                            value={eodChannel}
                                            onChange={(e) => { const v = e.target.value; setEodChannel(v); saveEod({ eod_channel: v }); }}
                                            className="mt-1 w-full px-3 py-2 border border-input rounded-xl text-sm bg-background text-foreground focus:border-amber-500 focus:outline-none"
                                            data-testid="eod-channel-select"
                                        >
                                            <option value="email">Email</option>
                                            {(canManageSlack || slackTeamConnected) && (
                                                <option value="slack">Slack{slackTeamConnected ? '' : ' (connect first)'}</option>
                                            )}
                                            {(canManageSlack || slackTeamConnected) && (
                                                <option value="both">Email + Slack</option>
                                            )}
                                        </select>
                                    </div>
                                    <Button size="sm" variant="outline" onClick={previewEod} disabled={eodPreviewing || eodSaving} className="rounded-lg h-[42px]" data-testid="eod-preview-btn">
                                        {eodPreviewing ? 'Sending…' : 'Preview'}
                                    </Button>
                                </div>
                                <div>
                                    <Label className="text-xs text-muted-foreground">Days</Label>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="eod-days" role="group" aria-label="Days to send the end-of-day report">
                                        {[
                                            { n: 6, label: 'Sun' },
                                            { n: 0, label: 'Mon' },
                                            { n: 1, label: 'Tue' },
                                            { n: 2, label: 'Wed' },
                                            { n: 3, label: 'Thu' },
                                            { n: 4, label: 'Fri' },
                                            { n: 5, label: 'Sat' },
                                        ].map((d) => {
                                            const on = eodDays.includes(d.n);
                                            return (
                                                <button
                                                    key={d.n}
                                                    type="button"
                                                    onClick={() => toggleEodDay(d.n)}
                                                    aria-pressed={on}
                                                    data-testid={`eod-day-${d.n}`}
                                                    className={`min-w-[2.75rem] px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                                        on
                                                            ? 'bg-foreground text-background border-foreground'
                                                            : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
                                                    }`}
                                                >
                                                    {d.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                {(eodChannel === 'slack' || eodChannel === 'both') && !slackTeamConnected && (
                                    <p className="text-xs text-amber-700">
                                        {canManageSlack
                                            ? 'Slack is selected but not connected yet — connect it below.'
                                            : 'Ask your Teams admin to connect Slack.'}
                                    </p>
                                )}
                                <details className="rounded-xl border border-border bg-muted/40 group">
                                    <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-foreground flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
                                        <span>Customize contents</span>
                                        <span className="text-xs text-slate-500 group-open:hidden">Show</span>
                                        <span className="text-xs text-slate-500 hidden group-open:inline">Hide</span>
                                    </summary>
                                    <div className="px-4 pb-3 border-t border-border pt-2" data-testid="eod-sections">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                            {[
                                                { key: 'completed', label: 'Completed today', help: 'Tasks you finished' },
                                                { key: 'open', label: 'Still open', help: 'Work left on your plate' },
                                                { key: 'missed', label: 'Missed due dates', help: 'Overdue items' },
                                                { key: 'manager_snapshot', label: 'Team you manage', help: 'Quick view of direct reports’ status' },
                                                { key: 'suggested_plan', label: 'Suggested follow-ups', help: 'Jarvis tips for tomorrow' },
                                            ].map((s) => (
                                                <label
                                                    key={s.key}
                                                    className="flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-background/80"
                                                    data-testid={`eod-section-${s.key}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={!!eodSections[s.key]}
                                                        onChange={() => toggleEodSection(s.key)}
                                                        className="accent-amber-600 mt-0.5"
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="text-sm text-foreground block">{s.label}</span>
                                                        <span className="text-[11px] text-muted-foreground">{s.help}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </details>
                            </div>
                        )}
                    </div>

                    {/* Smart Reminders */}
                    <SmartRemindersCard slackConnected={slackTeamConnected} />

                    {/* Slack Bridge — Teams admin only */}
                    {canManageSlack ? (
                    <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 space-y-4" data-testid="slack-settings-card">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-[#4A154B] text-white flex items-center justify-center font-bold text-lg">S</span>
                            <div className="flex-1">
                                <h3 className="font-semibold text-base">Slack</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Channel posts use a webhook. After two ignored pings, Jarvis DMs the assignee
                                    {slackBotEnabled ? ' — follow-up DMs are on.' : ' when SLACK_BOT_TOKEN is set on the server.'}
                                </p>
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
                                            className="flex-1 px-3 py-2.5 border border-input rounded-xl text-sm bg-background text-foreground focus:border-teal-500 focus:outline-none font-mono"
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
                                    <Button variant="outline" size="sm" onClick={async () => { const ok = await saveSlack({ value: '', silent: true }); if (ok) { setSlackWebhook(''); setSlackTeamConnected(false); toast.success('Slack disconnected'); } }} className="text-red-600 border-red-200 hover:bg-red-50 rounded-lg">
                                        Disconnect
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                    ) : user?.subscription_tier === 'teams' ? (
                    <div className="bg-card text-card-foreground border border-border rounded-2xl p-5 space-y-2" data-testid="slack-settings-member">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-[#4A154B] text-white flex items-center justify-center font-bold text-lg">S</span>
                            <div>
                                <h3 className="font-semibold text-base">Slack</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {slackTeamConnected
                                        ? (slackBotEnabled
                                            ? 'Connected. Jarvis DMs people who ignore two pings, then updates their task from the reply.'
                                            : 'Connected by your admin for channel posts.')
                                        : 'Only your Teams admin can connect Slack. Once they do, follow-ups can go to Slack too.'}
                                </p>
                            </div>
                            {slackTeamConnected && (
                                <span className="ml-auto text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">Connected</span>
                            )}
                        </div>
                    </div>
                    ) : (
                    <div className="bg-card text-card-foreground border border-border rounded-2xl p-5" data-testid="slack-settings-upgrade">
                        <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-[#4A154B]/80 text-white flex items-center justify-center font-bold text-lg">S</span>
                            <div>
                                <h3 className="font-semibold text-base">Slack</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">Available on Teams</p>
                            </div>
                        </div>
                    </div>
                    )}

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
                        <h2 className="text-2xl font-bold mb-6 text-foreground" style={{ fontFamily: 'Outfit' }}>Plans</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Free Plan */}
                            <Card className={`border rounded-2xl ${
                                user?.subscription_tier === 'free' 
                                    ? 'border-primary shadow-lg' 
                                    : 'border-border shadow-soft'
                            }`}>
                                <CardHeader>
                                    <CardTitle className="text-xl" style={{ fontFamily: 'Outfit' }}>Free</CardTitle>
                                    <CardDescription>
                                        <span className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Outfit' }}>$0</span>
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
                            <Card className={`border rounded-2xl ${
                                user?.subscription_tier === 'pro' 
                                    ? 'border-primary shadow-lg' 
                                    : 'border-border shadow-soft'
                            }`}>
                                <CardHeader>
                                    <CardTitle className="text-xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                        <Crown className="w-5 h-5 text-amber-500" />
                                        Pro
                                    </CardTitle>
                                    <CardDescription>
                                        <span className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Outfit' }}>$9</span>
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
                            <Card className={`border rounded-2xl ${
                                user?.subscription_tier === 'teams' 
                                    ? 'border-primary shadow-lg' 
                                    : 'border-border shadow-soft'
                            }`}>
                                <CardHeader>
                                    <CardTitle className="text-xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                        <Users className="w-5 h-5 text-teal-600" />
                                        Teams
                                    </CardTitle>
                                    <CardDescription>
                                        <span className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Outfit' }}>$12</span>
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
                                            <Badge className="w-full justify-center py-2 rounded-full bg-teal-600 text-white">
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
                                            className="w-full rounded-full h-12 font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 bg-teal-600 hover:bg-teal-700"
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
const REMINDER_PRESETS = {
    essential: {
        label: 'Quiet',
        help: 'Only High & Urgent tasks · in-app only',
        enabled: true,
        triggers: ['time_before_due', 'overdue'],
        hours_before_due: 4,
        frequency_hours: 12,
        channels: ['in_app'],
        priorities: ['High', 'Urgent'],
        max_emails_per_day: 3,
        quiet_hours_start: 21,
        quiet_hours_end: 8,
    },
    balanced: {
        label: 'Balanced',
        help: 'Medium+ priorities · app + email',
        enabled: true,
        triggers: ['time_before_due', 'no_response', 'overdue'],
        hours_before_due: 4,
        frequency_hours: 8,
        channels: ['in_app', 'email'],
        priorities: ['Medium', 'High', 'Urgent'],
        max_emails_per_day: 5,
        quiet_hours_start: 21,
        quiet_hours_end: 8,
    },
    assertive: {
        label: 'Assertive',
        help: 'All priorities · more frequent nudges',
        enabled: true,
        triggers: ['time_before_due', 'no_response', 'no_progress', 'overdue'],
        hours_before_due: 6,
        frequency_hours: 4,
        channels: ['in_app', 'email'],
        priorities: ['Low', 'Medium', 'High', 'Urgent'],
        max_emails_per_day: 8,
        quiet_hours_start: 22,
        quiet_hours_end: 7,
    },
};

const arraysEqual = (a = [], b = []) => {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
};

const matchReminderPreset = (rule) => {
    for (const [key, p] of Object.entries(REMINDER_PRESETS)) {
        if (
            arraysEqual(rule.triggers, p.triggers) &&
            arraysEqual(rule.priorities, p.priorities) &&
            arraysEqual(rule.channels, p.channels) &&
            Number(rule.hours_before_due) === p.hours_before_due &&
            Number(rule.frequency_hours) === p.frequency_hours &&
            Number(rule.max_emails_per_day ?? 5) === p.max_emails_per_day &&
            Number(rule.quiet_hours_start ?? 21) === p.quiet_hours_start &&
            Number(rule.quiet_hours_end ?? 8) === p.quiet_hours_end
        ) {
            return key;
        }
    }
    return null;
};

const SmartRemindersCard = ({ slackConnected }) => {
    const [rule, setRule] = React.useState({
        enabled: true,
        triggers: ['time_before_due', 'overdue'],
        hours_before_due: 4,
        frequency_hours: 12,
        channels: ['in_app'],
        priorities: ['High', 'Urgent'],
        max_emails_per_day: 5,
        quiet_hours_start: 21,
        quiet_hours_end: 8,
    });
    const [saving, setSaving] = React.useState(false);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        (async () => {
            try {
                const r = await axios.get(`${API}/reminders/rules`);
                setRule((prev) => ({ ...prev, ...(r.data?.rules || {}) }));
            } catch (_) { /* noop */ } finally { setLoading(false); }
        })();
    }, []);

    const save = async (patch, opts = {}) => {
        const next = { ...rule, ...patch };
        // Never persist empty channels while enabled — fall back to in-app
        if (next.enabled && (!next.channels || next.channels.length === 0)) {
            next.channels = ['in_app'];
        }
        setRule(next);
        setSaving(true);
        try {
            await axios.put(`${API}/reminders/rules`, next);
            if (opts.notify) toast.success(opts.notify);
        } catch (_) { toast.error('Failed to save reminders'); }
        finally { setSaving(false); }
    };

    const applyPreset = (key) => {
        const p = REMINDER_PRESETS[key];
        if (!p) return;
        const { label, help, ...settings } = p;
        save(settings, { notify: `Set to “${label}”` });
    };

    const toggleFrom = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

    if (loading) {
        return <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 text-sm text-muted-foreground">Loading reminders…</div>;
    }

    const activePreset = matchReminderPreset(rule);
    const channelLabels = { in_app: 'In app', email: 'Email', slack: 'Slack' };
    const triggerLabels = {
        time_before_due: 'Before due',
        no_response: 'No acceptance',
        no_progress: 'No progress',
        overdue: 'Past due',
    };
    const summary = !rule.enabled
        ? 'Off'
        : `${(rule.priorities || []).join(', ') || 'No priorities'} · ${(rule.channels || []).map((c) => channelLabels[c] || c).join(', ') || 'No channels'}`;

    const nudgeWhen = [
        { key: 'time_before_due', label: 'Coming up soon (before due date)' },
        { key: 'no_response', label: 'Assignee hasn’t accepted yet' },
        { key: 'no_progress', label: 'Accepted but no progress' },
        { key: 'overdue', label: 'Past the due date' },
    ];

    const channels = [
        { key: 'in_app', label: 'In the app', disabled: false },
        { key: 'email', label: 'Email', disabled: false },
        { key: 'slack', label: 'Slack', disabled: !slackConnected },
    ];

    return (
        <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 space-y-4" data-testid="reminders-settings-card">
            <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center text-lg">⏰</span>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base">Smart Reminders</h3>
                    <p className="text-xs text-muted-foreground">Automatic nudges when tasks need attention — before they’re due, stuck, or overdue.</p>
                </div>
                <IosSwitch
                    checked={rule.enabled}
                    testId="reminders-enable-toggle"
                    onChange={(e) => save({ enabled: e.target.checked })}
                />
            </div>

            <p className="text-xs text-muted-foreground" data-testid="reminders-value-summary">{summary}</p>

            {rule.enabled && (
                <div className="space-y-3 pt-2 border-t">
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Reminder intensity">
                        {Object.entries(REMINDER_PRESETS).map(([key, p]) => {
                            const selected = activePreset === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => applyPreset(key)}
                                    className={`text-left p-3 rounded-xl border transition-colors ${
                                        selected
                                            ? 'border-rose-500 bg-rose-600 text-white ring-1 ring-rose-500'
                                            : 'border-border bg-background text-foreground hover:border-rose-300'
                                    }`}
                                    data-testid={`reminder-preset-${key}`}
                                    aria-pressed={selected}
                                >
                                    <span className={`text-sm font-semibold block ${selected ? 'text-white' : 'text-foreground'}`}>{p.label}</span>
                                    <span className={`text-[11px] leading-snug block ${selected ? 'text-white' : 'text-muted-foreground'}`}>{p.help}</span>
                                </button>
                            );
                        })}
                    </div>

                    <details className="rounded-xl border border-border bg-muted/40 group">
                        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-foreground flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
                            <span>Customize</span>
                            <span className="text-xs text-slate-500 group-open:hidden">Show</span>
                            <span className="text-xs text-slate-500 hidden group-open:inline">Hide</span>
                        </summary>
                        <div className="px-4 pb-4 space-y-4 border-t border-slate-200/80 pt-3">
                            <div>
                                <p className="text-xs font-medium text-slate-600 mb-1.5">When</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {nudgeWhen.map((t) => {
                                        const on = (rule.triggers || []).includes(t.key);
                                        return (
                                            <button
                                                key={t.key}
                                                type="button"
                                                onClick={() => save({ triggers: toggleFrom(rule.triggers || [], t.key) })}
                                                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                                                    on ? 'bg-muted border-border text-foreground font-medium' : 'bg-background border-border text-muted-foreground'
                                                }`}
                                                data-testid={`reminder-trigger-${t.key}`}
                                                aria-pressed={on}
                                            >
                                                {t.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-medium text-slate-600 mb-1.5">Priorities</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {['Low', 'Medium', 'High', 'Urgent'].map((p) => {
                                        const on = (rule.priorities || []).includes(p);
                                        return (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => save({ priorities: toggleFrom(rule.priorities || [], p) })}
                                                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                                                    on ? 'bg-muted border-border text-foreground font-medium' : 'bg-background border-border text-muted-foreground'
                                                }`}
                                                data-testid={`reminder-priority-${p}`}
                                                aria-pressed={on}
                                            >
                                                {p}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-medium text-slate-600 mb-1.5">Send via</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {channels.map((c) => {
                                        const on = (rule.channels || []).includes(c.key);
                                        return (
                                            <button
                                                key={c.key}
                                                type="button"
                                                disabled={c.disabled}
                                                title={c.disabled ? 'Connect Slack first' : undefined}
                                                onClick={() => !c.disabled && save({ channels: toggleFrom(rule.channels || [], c.key) })}
                                                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                                                    c.disabled
                                                        ? 'opacity-40 cursor-not-allowed bg-background border-border text-muted-foreground'
                                                        : on
                                                            ? 'bg-muted border-border text-foreground font-medium'
                                                            : 'bg-background border-border text-muted-foreground'
                                                }`}
                                                data-testid={`reminder-channel-${c.key}`}
                                                aria-pressed={on}
                                            >
                                                {c.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs text-muted-foreground">Hours before due</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={72}
                                        value={rule.hours_before_due}
                                        onChange={(e) => save({ hours_before_due: parseInt(e.target.value || '1', 10) })}
                                        className="rounded-xl mt-1 bg-white"
                                        data-testid="reminder-hours-before"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-muted-foreground">Min hours between nudges</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={72}
                                        value={rule.frequency_hours}
                                        onChange={(e) => save({ frequency_hours: parseInt(e.target.value || '1', 10) })}
                                        className="rounded-xl mt-1 bg-white"
                                        data-testid="reminder-frequency"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-muted-foreground">Max emails / day</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={20}
                                        value={rule.max_emails_per_day ?? 5}
                                        onChange={(e) => save({ max_emails_per_day: parseInt(e.target.value || '0', 10) })}
                                        className="rounded-xl mt-1 bg-white"
                                        data-testid="reminder-max-emails"
                                        disabled={!(rule.channels || []).includes('email')}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Quiet from</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={rule.quiet_hours_start ?? 21}
                                            onChange={(e) => save({ quiet_hours_start: parseInt(e.target.value || '21', 10) })}
                                            className="rounded-xl mt-1 bg-white"
                                            data-testid="reminder-quiet-start"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">until</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={rule.quiet_hours_end ?? 8}
                                            onChange={(e) => save({ quiet_hours_end: parseInt(e.target.value || '8', 10) })}
                                            className="rounded-xl mt-1 bg-white"
                                            data-testid="reminder-quiet-end"
                                        />
                                    </div>
                                </div>
                            </div>
                            {/* Keep timing toggle test id for compatibility */}
                            <span className="sr-only" data-testid="reminder-timing-toggle">{(rule.triggers || []).map((t) => triggerLabels[t] || t).join(', ')}</span>
                        </div>
                    </details>

                    {saving && <p className="text-xs text-muted-foreground">Saving…</p>}
                </div>
            )}
        </div>
    );
};