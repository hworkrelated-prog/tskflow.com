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
import AnalyticsPage from '@/pages/AnalyticsPage';
import SettingsPage from '@/pages/SettingsPage';
import PaymentSuccessPage from '@/pages/PaymentSuccessPage';
import TeamManagementPage from '@/pages/TeamManagementPage';
import AdminPage from '@/pages/AdminPage';
import LeadsPage from '@/pages/LeadsPage';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
                </Routes>
            </BrowserRouter>
            <Toaster position="top-right" />
        </AuthProvider>
    );
}

export default App;
export { API };