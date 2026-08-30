import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { AlertCircle, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '@/lib/utils';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import TskFlowLogo from '@/components/TskFlowLogo';

const GOOGLE_ERRORS = {
    google_not_configured: 'Google sign-in is not configured on this deployment yet. Use email and password for now.',
    google_signin_failed: 'Google sign-in did not complete. Try again or use email and password.',
    invalid_state: 'That Google sign-in link expired. Try again.',
};

const LoginPage = () => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const { login } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const googleError = GOOGLE_ERRORS[searchParams.get('error')] || '';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API}/auth/login`, formData);
            login(response.data.access_token, response.data.user);
            toast.success('Welcome back!');
            const next = searchParams.get('next') || '';
            const safe = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
                ? next
                : '/dashboard';
            navigate(safe === '/login' || safe.startsWith('/register') ? '/dashboard' : safe);
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
        <div data-testid="login-page" className="min-h-screen gradient-mesh flex items-center justify-center p-6 relative">
            <Link to="/" className="absolute top-6 left-6 hover:opacity-80 transition-opacity">
                <TskFlowLogo variant="light" size="md" />
            </Link>
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
                            Welcome back
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {googleError && (
                            <div
                                data-testid="login-google-error"
                                className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                            >
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{googleError}</span>
                            </div>
                        )}
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
                        <div className="mt-4 flex items-center gap-3">
                            <span className="h-px flex-1 bg-border" />
                            <span className="text-xs text-muted-foreground">or</span>
                            <span className="h-px flex-1 bg-border" />
                        </div>
                        <GoogleSignInButton
                            label="Sign in with Google"
                            next="/dashboard"
                            className="mt-4 w-full h-12 font-semibold"
                            testId="login-google-signin"
                        />
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