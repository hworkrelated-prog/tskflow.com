import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const LoginPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        adminCode: ''
    });
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isLogin) {
                const response = await axios.post(`${API}/auth/login`, {
                    email: formData.email,
                    password: formData.password
                });
                login(response.data.access_token, response.data.user);
                toast.success('Login successful');
                navigate('/');
            } else {
                const response = await axios.post(`${API}/auth/register`, {
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    admin_code: formData.adminCode || null
                });
                login(response.data.access_token, response.data.user);
                toast.success('Registration successful');
                navigate('/');
            }
        } catch (error) {
            toast.error(error.response?.data?.detail || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="login-page" className="flex min-h-screen">
            {/* Left side - Form */}
            <div className="flex-1 flex items-center justify-center p-8 bg-white">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-md"
                >
                    <Card className="border-2 shadow-sm rounded-sm">
                        <CardHeader className="space-y-1">
                            <CardTitle className="text-4xl font-semibold tracking-tight" style={{ fontFamily: 'Outfit' }}>
                                {isLogin ? 'Welcome Back' : 'Get Started'}
                            </CardTitle>
                            <CardDescription className="text-base">
                                {isLogin ? 'Sign in to your account' : 'Create your account'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {!isLogin && (
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Full Name</Label>
                                        <Input
                                            id="name"
                                            data-testid="name-input"
                                            type="text"
                                            placeholder="John Doe"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            required
                                            className="rounded-md"
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        data-testid="email-input"
                                        type="email"
                                        placeholder="name@company.com"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        required
                                        className="rounded-md"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Password</Label>
                                    <Input
                                        id="password"
                                        data-testid="password-input"
                                        type="password"
                                        placeholder="••••••••"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        required
                                        className="rounded-md"
                                    />
                                </div>
                                {!isLogin && (
                                    <div className="space-y-2">
                                        <Label htmlFor="adminCode">Admin Code (optional)</Label>
                                        <Input
                                            id="adminCode"
                                            data-testid="admin-code-input"
                                            type="text"
                                            placeholder="First user needs admin code"
                                            value={formData.adminCode}
                                            onChange={(e) => setFormData({ ...formData, adminCode: e.target.value })}
                                            className="rounded-md"
                                        />
                                        <p className="text-xs text-muted-foreground">Use admin code ADMIN2025 for first user</p>
                                    </div>
                                )}
                                <Button
                                    data-testid="submit-button"
                                    type="submit"
                                    className="w-full rounded-md font-medium"
                                    disabled={loading}
                                >
                                    {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Sign Up'}
                                </Button>
                            </form>
                            <div className="mt-4 text-center">
                                <button
                                    data-testid="toggle-auth-mode"
                                    type="button"
                                    className="text-sm text-muted-foreground hover:text-foreground underline"
                                    onClick={() => setIsLogin(!isLogin)}
                                >
                                    {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Right side - Image */}
            <div className="hidden lg:flex flex-1 relative overflow-hidden">
                <img
                    src="https://images.pexels.com/photos/1106476/pexels-photo-1106476.jpeg"
                    alt="Task Management"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <div className="text-white text-center p-8">
                        <h1 className="text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit' }}>Task Accountability</h1>
                        <p className="text-xl">Track execution. Spot trends. Drive results.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;