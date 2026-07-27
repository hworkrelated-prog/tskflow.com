import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from '@/components/ui/sonner';
import '@/App.css';

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
import AnalyticsPage from '@/pages/AnalyticsPage';
import SettingsPage from '@/pages/SettingsPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import TeamManagementPage from '@/pages/TeamManagementPage';
import AdminPage from '@/pages/AdminPage';
import LeadsPage from '@/pages/LeadsPage';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import ErrorBoundary from '@/components/ErrorBoundary';

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

    // Poll for pending mentions / notifications and fire native Chrome notifications
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        const pollOnce = async () => {
            if (cancelled) return;
            try {
                const res = await axios.get(`${API}/notifications/pending`);
                const items = (res.data && res.data.notifications) || [];
                if ('Notification' in window && Notification.permission === 'granted') {
                    items.forEach((n) => {
                        try {
                            const notif = new Notification(n.title || 'Tskflow', {
                                body: n.body || '',
                                icon: '/favicon.ico',
                                tag: n.id,
                            });
                            notif.onclick = () => {
                                window.focus();
                                if (n.task_id) {
                                    window.location.href = `/task/${n.task_id}`;
                                }
                                notif.close();
                            };
                        } catch (_) { /* silent */ }
                    });
                }
            } catch (_) { /* silent — server may be down momentarily */ }
        };
        // Fire once immediately, then every 30s
        pollOnce();
        const interval = setInterval(pollOnce, 30000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [user]);

    // WebSocket connection for real-time notifications + chatter
    useEffect(() => {
        if (!user || !token) return;
        let ws;
        let reconnectTimer;
        const connect = () => {
            try {
                const wsProto = (BACKEND_URL || window.location.origin).replace(/^http/, 'ws');
                ws = new WebSocket(`${wsProto}/api/ws?token=${encodeURIComponent(token)}`);
                ws.onmessage = (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (data.event === 'notification') {
                            window.dispatchEvent(new CustomEvent('tskflow:notification', { detail: data.notification }));
                            // Also trigger a native notification if allowed
                            if ('Notification' in window && Notification.permission === 'granted' && data.notification) {
                                try {
                                    const n = new Notification(data.notification.title, { body: data.notification.body, tag: data.notification.id });
                                    n.onclick = () => { window.focus(); if (data.notification.task_id) window.location.href = `/task/${data.notification.task_id}`; };
                                } catch (_) { /* noop */ }
                            }
                        } else if (data.event === 'new_comment') {
                            window.dispatchEvent(new CustomEvent('tskflow:new_comment', { detail: data }));
                        }
                    } catch (_) { /* silent */ }
                };
                ws.onclose = () => {
                    reconnectTimer = setTimeout(connect, 3000);
                };
                ws.onerror = () => { try { ws.close(); } catch (_) { /* noop */ } };
            } catch (_) { /* silent */ }
        };
        connect();
        return () => {
            try { ws && ws.close(); } catch (_) { /* noop */ }
            if (reconnectTimer) clearTimeout(reconnectTimer);
        };
    }, [user, token]);

    const fetchCurrentUser = async () => {
        try {
            const response = await axios.get(`${API}/auth/me`);
            setUser(response.data);
        } catch (error) {
            console.error('Failed to fetch user', error);
            logout();
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
            <div className="flex items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium">Loading...</div>
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
            <div className="flex items-center justify-center min-h-screen gradient-mesh">
                <div className="text-lg font-medium">Loading...</div>
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
                </Routes>
            </BrowserRouter>
            <Toaster position="top-right" />
        </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
export { API };