import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Mail, RefreshCw } from 'lucide-react';
import { getErrorMessage } from '@/lib/utils';
import { shouldConnectCalendarOnSignup } from '@/lib/googleCalendar';

const EMAIL_KEY = 'tskflow_pending_verify_email';

const VerifyEmailPage = () => {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const initialEmail = useMemo(() => {
        const fromState = (location.state?.email || '').trim();
        const fromQuery = (searchParams.get('email') || '').trim();
        const fromStore = (typeof window !== 'undefined' && localStorage.getItem(EMAIL_KEY)) || '';
        return fromState || fromQuery || fromStore || '';
    }, [location.state, searchParams]);

    const [email, setEmail] = useState(initialEmail);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (initialEmail) {
            setEmail(initialEmail);
            try { localStorage.setItem(EMAIL_KEY, initialEmail); } catch { /* noop */ }
        }
    }, [initialEmail]);

    const digits = code.replace(/\D/g, '').slice(0, 6);
    const canVerify = email.includes('@') && digits.length === 6;

    const handleVerify = async (e) => {
        e.preventDefault();
        if (!canVerify) {
            toast.error(email.includes('@') ? 'Enter the 6-digit code from your email' : 'Enter the email you registered with');
            return;
        }
        setLoading(true);

        try {
            const response = await axios.post(`${API}/auth/verify-email`, {
                email: email.trim().toLowerCase(),
                verification_code: digits,
            });
            try { localStorage.removeItem(EMAIL_KEY); } catch { /* noop */ }
            login(response.data.access_token, response.data.user);
            toast.success('Email verified successfully!');
            const dest = shouldConnectCalendarOnSignup(response.data.user)
                ? '/connect-calendar'
                : '/dashboard';
            navigate(dest);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Verification failed'));
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        const dest = email.trim().toLowerCase();
        if (!dest.includes('@')) {
            toast.error('Enter your email so we can resend the code');
            return;
        }
        setResending(true);
        try {
            await axios.post(`${API}/auth/resend-verification?email=${encodeURIComponent(dest)}`);
            try { localStorage.setItem(EMAIL_KEY, dest); } catch { /* noop */ }
            toast.success('New code sent - check your inbox and spam folder');
            setCode('');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to resend code'));
        } finally {
            setResending(false);
        }
    };

    return (
        <div data-testid="verify-email-page" className="min-h-screen gradient-mesh flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="border-2 shadow-soft rounded-2xl">
                    <CardHeader className="space-y-2 text-center">
                        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <Mail className="w-8 h-8 text-primary" />
                        </div>
                        <CardTitle className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>
                            Verify Your Email
                        </CardTitle>
                        <CardDescription className="text-base">
                            {email
                                ? <>We sent a 6-digit code to <span className="font-semibold">{email}</span></>
                                : 'Enter the email you registered with, then the 6-digit code from that inbox.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleVerify} className="space-y-4">
                            {!initialEmail && (
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        data-testid="verify-email-input"
                                        type="email"
                                        placeholder="you@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        className="rounded-xl h-12"
                                    />
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="code">Verification Code</Label>
                                <Input
                                    id="code"
                                    data-testid="verification-code-input"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="Enter 6-digit code"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    required
                                    maxLength={6}
                                    className="rounded-xl h-12 text-center text-2xl tracking-widest font-mono"
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                    Use the code from your email - not the placeholder.
                                </p>
                            </div>
                            <Button
                                data-testid="verify-button"
                                type="submit"
                                className="w-full rounded-full h-12 font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                                disabled={loading || !canVerify}
                            >
                                {loading ? 'Verifying...' : 'Verify Email'}
                            </Button>
                        </form>
                        <div className="mt-6 text-center space-y-3">
                            <button
                                data-testid="resend-code"
                                type="button"
                                onClick={handleResend}
                                disabled={resending || !email.includes('@')}
                                className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
                                {resending ? 'Sending...' : "Didn't receive code? Resend"}
                            </button>
                            <div>
                                <button
                                    type="button"
                                    className="text-sm text-muted-foreground hover:text-foreground underline"
                                    onClick={() => navigate('/login')}
                                >
                                    Back to login
                                </button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default VerifyEmailPage;
