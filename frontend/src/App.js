import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import '@/App.css';

import LoginPage from '@/pages/LoginPage';
import ManagerDashboard from '@/pages/ManagerDashboard';
import AdminDashboard from '@/pages/AdminDashboard';
import CreateTask from '@/pages/CreateTask';
import TaskDetail from '@/pages/TaskDetail';
import PerformancePage from '@/pages/PerformancePage';
import TrendsPage from '@/pages/TrendsPage';

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
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{ user, token, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    return children;
};

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <DashboardRouter />
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
                        path="/admin/create-task"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <CreateTask />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/performance"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <PerformancePage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin/trends"
                        element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <TrendsPage />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </BrowserRouter>
            <Toaster position="top-right" />
        </AuthProvider>
    );
}

const DashboardRouter = () => {
    const { user } = useAuth();
    return user?.role === 'admin' ? <AdminDashboard /> : <ManagerDashboard />;
};

export default App;
export { API };