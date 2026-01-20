import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Mail, RefreshCw } from 'lucide-react';

const VerifyEmailPage = () => {
    const location = useLocation();
    const email = location.state?.email || '';
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleVerify = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API}/auth/verify-email`, {
                email,
                verification_code: code
            });
            login(response.data.access_token, response.data.user);
            toast.success('Email verified successfully!');
            navigate('/dashboard');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        try {
            const response = await axios.post(`${API}/auth/resend-verification?email=${email}`);
            if (response.data.verification_code) {
                toast.success(`New code: ${response.data.verification_code}`);
            } else {
                toast.success('Verification code sent!');
            }
        } catch (error) {
            toast.error('Failed to resend code');
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
                            We sent a 6-digit code to <span className="font-semibold">{email}</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleVerify} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="code">Verification Code</Label>
                                <Input
                                    id="code"
                                    data-testid="verification-code-input"
                                    type="text"
                                    placeholder="000000"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    required
                                    maxLength={6}
                                    className="rounded-xl h-12 text-center text-2xl tracking-widest font-mono"
                                />
                            </div>
                            <Button
                                data-testid="verify-button"
                                type="submit"
                                className="w-full rounded-full h-12 font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                                disabled={loading || code.length !== 6}
                            >
                                {loading ? 'Verifying...' : 'Verify Email'}
                            </Button>
                        </form>
                        <div className="mt-6 text-center space-y-3">
                            <button
                                data-testid="resend-code"
                                type="button"
                                onClick={handleResend}
                                disabled={resending}
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