import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from '@/components/ui/sonner';
import '@/App.css';
import { cleanDisplayText, cleanJsonTree } from '@/lib/cleanDisplayText';

axios.interceptors.response.use((res) => {
    if (res.data && (typeof res.data === 'object' || typeof res.data === 'string')) {
        res.data = cleanJsonTree(res.data);
    }
    return res;
});

import LandingPage from '@/pages/LandingPage';
import RegistrationPage from '@/pages/RegistrationPage';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import LoginPage from '@/pages/LoginPage';
import ForgotPassword from '@/pages/ForgotPassword';
import TaskHub from '@/pages/TaskHub';
import TaskDetail from '@/pages/TaskDetail';
import GroupTaskDetail from '@/pages/GroupTaskDetail';
import UpdatesPage from '@/pages/UpdatesPage';
import LeaderboardPage from '@/pages/LeaderboardPage';
import TranscriptImportPage from '@/pages/TranscriptImportPage';
import RecordingEditorPage from '@/pages/RecordingEditorPage';
import RecordingSharePage from '@/pages/RecordingSharePage';
import RecordingLibraryPage from '@/pages/RecordingLibraryPage';
import RecordingControlsPopup from '@/pages/RecordingControlsPopup';
import AnalyticsPage from '@/pages/AnalyticsPage';
import ActivityLogPage from '@/pages/ActivityLogPage';
import SettingsPage from '@/pages/SettingsPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import TeamManagementPage from '@/pages/TeamManagementPage';
import AdminPage from '@/pages/AdminPage';
import LeadsPage from '@/pages/LeadsPage';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import LegalPage from '@/pages/LegalPage';
import HelpCenter from '@/pages/HelpCenter';
import RecurringPage from '@/pages/RecurringPage';
import ContactPage from '@/pages/ContactPage';
import ErrorBoundary from '@/components/ErrorBoundary';
import GlobalAIDock from '@/components/GlobalAIDock';
import VoiceMode from '@/components/VoiceMode';
import CatchUpReview from '@/components/CatchUpReview';
import { applyTheme } from '@/lib/theme';
import TeamSetupModal from '@/components/TeamSetupModal';
import WhatsNewPrompt from '@/components/WhatsNewPrompt';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);
    const [pendingRedirect, setPendingRedirect] = useState(localStorage.getItem('pendingTaskRedirect'));

    useEffect(() => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            fetchCurrentUser();
        } else {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        const saved = user?.preferences?.theme;
        if (saved) applyTheme(saved);
    }, [user]);

    // Prompt for browser notification permission whenever we have a live session
    // (covers both fresh sign-in AND page reloads for existing sessions).
    useEffect(() => {
        if (!user) return;
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            // Slight delay so it doesn't block initial paint / feels less abrupt
            const t = setTimeout(() => {
                Notification.requestPermission().catch(() => {});
            }, 800);
            return () => clearTimeout(t);
        }
    }, [user]);

    // Smart catch-up on login (replaces spammy per-task Chrome popups for backlog).
    // In-app sheet only — never fire an OS toast when the user just opened the app.
    // Also poll only for *very recent* live events (mentions/nudges) — never reminders.
    useEffect(() => {
        if (!user) return;
        let cancelled = false;

        const sanitize = (s) => cleanDisplayText(s);

        const catchUpIsMeaningful = (data) => {
            const s = data?.summary || {};
            // Don't auto-interrupt for vague “other” rows alone (legacy Slack noise, etc.)
            return Boolean(
                s.overdue_tasks ||
                s.due_soon_tasks ||
                s.unread_mentions ||
                s.unread_nudges ||
                s.unread_reminders
            );
        };

        const runCatchUp = async () => {
            if (cancelled) return;
            const sessionKey = `tsk_catchup_shown_${user.id || user.email || 'me'}`;
            try {
                const res = await axios.get(`${API}/notifications/catch-up`);
                if (cancelled) return;
                const data = res.data;
                if (!data?.has_items || !catchUpIsMeaningful(data)) return;

                // Open the in-app review once per browser session — no OS banner.
                // (OS toasts on open felt like spam: user is already looking at the app.)
                if (!sessionStorage.getItem(sessionKey)) {
                    sessionStorage.setItem(sessionKey, '1');
                    window.dispatchEvent(new CustomEvent('tskflow:catch-up', { detail: data }));
                }
            } catch (_) { /* silent */ }
        };

        const pollLive = async () => {
            if (cancelled) return;
            // Never OS-toast while the user is actively looking at the app after a return —
            // catch-up / the bell cover backlog. Live toasts are for events that arrive
            // while already focused (WebSocket path) or the rare pending poll hit.
            if (document.visibilityState !== 'visible') return;
            try {
                const res = await axios.get(`${API}/notifications/pending`);
                const items = (res.data && res.data.notifications) || [];
                if (!items.length) return;
                if (!('Notification' in window) || Notification.permission !== 'granted') return;
                // Cap live OS toasts hard — never dump a backlog
                items.slice(0, 3).forEach((n) => {
                    try {
                        const notif = new Notification(sanitize(n.title) || 'TskFlow', {
                            body: sanitize(n.body),
                            icon: '/icon-192.png',
                            tag: n.id || n.task_id || 'tsk-live',
                        });
                        notif.onclick = () => {
                            window.focus();
                            if (n.task_id) window.location.href = `/task/${n.task_id}${n.type === 'reminder' || n.type === 'nudge' ? '?tab=reminders' : ''}`;
                            notif.close();
                        };
                    } catch (_) { /* silent */ }
                });
            } catch (_) { /* silent */ }
        };

        runCatchUp();
        // Live poll is infrequent and only for brand-new non-reminder events.
        // Do NOT poll immediately on tab-focus — that re-toasts backlog the moment
        // you open the app after being away. Interval-only is enough.
        let interval = null;
        const startPoll = () => {
            if (interval) return;
            interval = setInterval(() => {
                if (document.visibilityState === 'visible') pollLive();
            }, 60000);
        };
        const stopPoll = () => {
            if (interval) { clearInterval(interval); interval = null; }
        };
        const onVis = () => {
            if (document.visibilityState === 'visible') startPoll();
            else stopPoll();
        };
        if (document.visibilityState === 'visible') startPoll();
        document.addEventListener('visibilitychange', onVis);
        return () => {
            cancelled = true;
            stopPoll();
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [user]);

    // WebSocket connection for real-time notifications + chatter
    useEffect(() => {
        if (!user || !token) return;
        let ws;
        let reconnectTimer;
        let pingTimer;
        let intentionalClose = false;

        const clearTimers = () => {
            if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
            if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        };

        const connect = () => {
            try {
                clearTimers();
                const wsProto = (BACKEND_URL || window.location.origin).replace(/^http/, 'ws');
                ws = new WebSocket(`${wsProto}/api/ws?token=${encodeURIComponent(token)}`);
                ws.onopen = () => {
                    // Keep-alive so proxies / laptop sleep don't silently kill the socket
                    pingTimer = setInterval(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            try { ws.send('ping'); } catch (_) { /* noop */ }
                        }
                    }, 25000);
                };
                ws.onmessage = (ev) => {
                    try {
                        if (ev.data === 'pong') return;
                        const data = cleanJsonTree(JSON.parse(ev.data));
                        if (data.event === 'notification') {
                            window.dispatchEvent(new CustomEvent('tskflow:notification', { detail: data.notification }));
                            // Realtime OS toast for live events only — never for reminder backlog types
                            const nType = data.notification?.type;
                            const allowOs = nType && nType !== 'reminder';
                            if (allowOs && 'Notification' in window && Notification.permission === 'granted' && data.notification) {
                                try {
                                    const title = cleanDisplayText(data.notification.title || 'TskFlow');
                                    const body = cleanDisplayText(data.notification.body || '');
                                    const n = new Notification(title, { body, tag: data.notification.id });
                                    n.onclick = () => { window.focus(); if (data.notification.task_id) window.location.href = `/task/${data.notification.task_id}${data.notification.type === 'reminder' || data.notification.type === 'nudge' ? '?tab=reminders' : ''}`; };
                                } catch (_) { /* noop */ }
                            }
                        } else if (data.event === 'new_comment') {
                            window.dispatchEvent(new CustomEvent('tskflow:new_comment', { detail: data }));
                        }
                    } catch (_) { /* silent */ }
                };
                ws.onclose = () => {
                    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
                    if (!intentionalClose) {
                        reconnectTimer = setTimeout(connect, 3000);
                    }
                };
                ws.onerror = () => { try { ws.close(); } catch (_) { /* noop */ } };
            } catch (_) { /* silent */ }
        };
        connect();

        let wakeBurst = null;
        const onVis = () => {
            if (document.visibilityState !== 'visible') return;
            // Wake from sleep / background: reconnect if the socket died
            if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
                connect();
            }
            if (wakeBurst) return;
            wakeBurst = setTimeout(() => {
                wakeBurst = null;
                window.dispatchEvent(new CustomEvent('tskflow:app-wake'));
            }, 250);
        };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('online', onVis);

        return () => {
            intentionalClose = true;
            clearTimers();
            if (wakeBurst) clearTimeout(wakeBurst);
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('online', onVis);
            try { ws && ws.close(); } catch (_) { /* noop */ }
        };
    }, [user, token]);

    const fetchCurrentUser = async () => {
        try {
            const response = await axios.get(`${API}/auth/me`);
            setUser(response.data);
        } catch (error) {
            console.error('Failed to fetch user', error);
            // Only clear the session on real auth failure — network blips
            // while offline / waking the PWA must not force a re-login.
            const status = error?.response?.status;
            if (status === 401 || status === 403) {
                logout();
            }
        } finally {
            setLoading(false);
        }
    };

    const login = (token, userData) => {
        localStorage.setItem('token', token);
        setToken(token);
        setUser(userData);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('pendingTaskRedirect');
        setToken(null);
        setUser(null);
        setPendingRedirect(null);
        delete axios.defaults.headers.common['Authorization'];
    };

    const setPendingTaskRedirect = (taskId) => {
        localStorage.setItem('pendingTaskRedirect', taskId);
        setPendingRedirect(taskId);
    };

    const clearPendingRedirect = () => {
        localStorage.removeItem('pendingTaskRedirect');
        setPendingRedirect(null);
    };

    // Let CSS clear space for the global FABs / home-indicator on every authenticated page
    useEffect(() => {
        document.body.classList.toggle('app-authenticated', Boolean(user));
        return () => document.body.classList.remove('app-authenticated');
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser: fetchCurrentUser, pendingRedirect, setPendingTaskRedirect, clearPendingRedirect }}>
            {children}
        </AuthContext.Provider>
    );
};

const ProtectedRoute = ({ children }) => {
    const { user, loading, pendingRedirect, clearPendingRedirect } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && user && pendingRedirect) {
            const taskId = pendingRedirect;
            clearPendingRedirect();
            navigate(`/task/${taskId}`);
        }
    }, [loading, user, pendingRedirect, clearPendingRedirect, navigate]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gradient-mesh app-boot-splash gap-3" data-testid="app-boot-splash">
                <div className="w-10 h-10 rounded-xl bg-teal-500/90 flex items-center justify-center text-white font-bold text-sm">TF</div>
                <div className="text-lg font-medium text-foreground">Loading…</div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

// Public route that redirects to dashboard if logged in
const PublicRoute = ({ children }) => {
    const { user, loading, pendingRedirect, clearPendingRedirect } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && user && pendingRedirect) {
            const taskId = pendingRedirect;
            clearPendingRedirect();
            navigate(`/task/${taskId}`);
        }
    }, [loading, user, pendingRedirect, clearPendingRedirect, navigate]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gradient-mesh app-boot-splash gap-3" data-testid="app-boot-splash">
                <div className="w-10 h-10 rounded-xl bg-teal-500/90 flex items-center justify-center text-white font-bold text-sm">TF</div>
                <div className="text-lg font-medium text-foreground">Loading…</div>
            </div>
        );
    }

    if (user) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

// Invite link handler
const InviteHandler = () => {
    const [searchParams] = useSearchParams();
    const { user, setPendingTaskRedirect } = useAuth();
    const navigate = useNavigate();
    const inviteToken = searchParams.get('token');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const handleInvite = async () => {
            if (!inviteToken) {
                setError('Invalid invite link');
                setLoading(false);
                return;
            }

            try {
                const response = await axios.get(`${API}/invite/${inviteToken}`);
                const { task_id, assigned_to_email } = response.data;

                if (user) {
                    // Already logged in, redirect to task
                    navigate(`/task/${task_id}`);
                } else {
                    // Store task ID and redirect to login
                    setPendingTaskRedirect(task_id);
                    navigate(`/login?email=${encodeURIComponent(assigned_to_email || '')}`);
                }
            } catch (err) {
                setError('Invalid or expired invite link');
                setLoading(false);
            }
        };

        handleInvite();
    }, [inviteToken, user, navigate, setPendingTaskRedirect]);

    if (loading && !error) {
        return (
            <div className="flex items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium">Loading invite...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium text-red-600">{error}</div>
                <button onClick={() => navigate('/login')} className="mt-4 text-indigo-600 underline">Go to Login</button>
            </div>
        );
    }

    return null;
};

function App() {
    return (
        <ErrorBoundary>
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/updates" element={<ProtectedRoute><UpdatesPage /></ProtectedRoute>} />
                    <Route path="/" element={
                        <PublicRoute>
                            <LandingPage />
                        </PublicRoute>
                    } />
                    <Route path="/register" element={<RegistrationPage />} />
                    <Route path="/verify-email" element={<VerifyEmailPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/payment-success" element={<PaymentSuccessPage />} />
                    <Route path="/invite" element={<InviteHandler />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/leads" element={<LeadsPage />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/legal" element={<LegalPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <TaskHub />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/task/:taskId"
                        element={
                            <ProtectedRoute>
                                <TaskDetail />
                            </ProtectedRoute>
                        }
                    />
                    {/* Group tasks now use the unified TaskDetail view */}
                    <Route
                        path="/group-task/:taskId"
                        element={
                            <ProtectedRoute>
                                <TaskDetail />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/task-shared/:token"
                        element={
                            <ProtectedRoute>
                                <TaskDetail />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/analytics"
                        element={
                            <ProtectedRoute>
                                <AnalyticsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/activity"
                        element={
                            <ProtectedRoute>
                                <ActivityLogPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute>
                                <SettingsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/team"
                        element={
                            <ProtectedRoute>
                                <TeamManagementPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/updates" element={<ProtectedRoute><UpdatesPage /></ProtectedRoute>} />
                    <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
                    <Route path="/transcript" element={<ProtectedRoute><TranscriptImportPage /></ProtectedRoute>} />
                    <Route path="/recording/edit" element={<ProtectedRoute><RecordingEditorPage /></ProtectedRoute>} />
                    <Route path="/recording/controls" element={<RecordingControlsPopup />} />
                    <Route path="/recording/:token" element={<RecordingSharePage />} />
                    <Route path="/recordings" element={<ProtectedRoute><RecordingLibraryPage /></ProtectedRoute>} />
                    <Route path="/help" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />
                    <Route path="/recurring" element={<ProtectedRoute><RecurringPage /></ProtectedRoute>} />
                </Routes>
                <div className="ai-bottom-stage" data-testid="ai-bottom-stage">
                    <VoiceMode dockIntegrated />
                    <GlobalAIDock />
                </div>
                <TeamSetupModal />
                <WhatsNewPrompt />
                <CatchUpReview />
            </BrowserRouter>
            <Toaster position="top-right" />
        </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
export { API };