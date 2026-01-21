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
import { LogIn } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';

const LoginPage = () => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API}/auth/login`, formData);
            login(response.data.access_token, response.data.user);
            toast.success('Welcome back!');
            navigate('/dashboard');
        } catch (error) {
            if (error.response?.status === 403) {
                toast.error('Please verify your email first');
                navigate('/verify-email', { state: { email: formData.email } });
            } else {
                toast.error(getErrorMessage(error, 'Login failed'));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="login-page" className="min-h-screen gradient-mesh flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="border-2 shadow-soft rounded-2xl">
                    <CardHeader className="space-y-2 text-center">
                        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <LogIn className="w-8 h-8 text-primary" />
                        </div>
                        <CardTitle className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>
                            Welcome Back
                        </CardTitle>
                        <CardDescription className="text-base">
                            Sign in to your Task Hub account
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
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
                                    className="rounded-xl h-12"
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
                                    className="rounded-xl h-12"
                                />
                            </div>
                            <Button
                                data-testid="submit-button"
                                type="submit"
                                className="w-full rounded-full h-12 font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                                disabled={loading}
                            >
                                {loading ? 'Signing in...' : 'Sign In'}
                            </Button>
                        </form>
                        <div className="mt-6 text-center space-y-3">
                            <button
                                data-testid="forgot-password-link"
                                type="button"
                                className="text-sm text-muted-foreground hover:text-foreground underline block"
                                onClick={() => navigate('/forgot-password')}
                            >
                                Forgot password?
                            </button>
                            <button
                                data-testid="go-to-register"
                                type="button"
                                className="text-sm text-muted-foreground hover:text-foreground underline block"
                                onClick={() => navigate('/register')}
                            >
                                Don't have an account? Sign up
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default LoginPage;