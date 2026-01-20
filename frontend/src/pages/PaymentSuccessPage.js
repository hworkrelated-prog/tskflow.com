import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const PaymentSuccessPage = () => {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');
    const [status, setStatus] = useState('checking');
    const [attempts, setAttempts] = useState(0);
    const { refreshUser } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!sessionId) {
            navigate('/settings');
            return;
        }
        
        pollPaymentStatus();
    }, [sessionId]);

    const pollPaymentStatus = async () => {
        const maxAttempts = 5;
        const pollInterval = 2000;

        if (attempts >= maxAttempts) {
            setStatus('timeout');
            toast.error('Payment verification timed out. Please check your email.');
            return;
        }

        try {
            const response = await axios.get(`${API}/payments/status/${sessionId}`);
            
            if (response.data.payment_status === 'paid') {
                setStatus('success');
                await refreshUser();
                toast.success('Subscription activated successfully!');
                setTimeout(() => navigate('/dashboard'), 3000);
                return;
            } else if (response.data.status === 'expired') {
                setStatus('expired');
                toast.error('Payment session expired');
                return;
            }

            // Continue polling
            setAttempts(prev => prev + 1);
            setTimeout(pollPaymentStatus, pollInterval);
        } catch (error) {
            console.error('Error checking payment:', error);
            setStatus('error');
            toast.error('Error verifying payment');
        }
    };

    return (
        <div className="min-h-screen gradient-mesh flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="border-2 shadow-soft rounded-2xl">
                    <CardHeader className="text-center">
                        {status === 'checking' && (
                            <>
                                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                </div>
                                <CardTitle className="text-2xl">Verifying Payment...</CardTitle>
                                <p className="text-muted-foreground mt-2">Please wait while we confirm your subscription</p>
                            </>
                        )}

                        {status === 'success' && (
                            <>
                                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                    <CheckCircle className="w-8 h-8 text-green-600" />
                                </div>
                                <CardTitle className="text-2xl text-green-700">Payment Successful!</CardTitle>
                                <p className="text-muted-foreground mt-2">Your subscription has been activated</p>
                            </>
                        )}

                        {(status === 'timeout' || status === 'error' || status === 'expired') && (
                            <>
                                <CardTitle className="text-2xl text-red-700">Payment Verification Failed</CardTitle>
                                <p className="text-muted-foreground mt-2">
                                    {status === 'expired' ? 'Session expired. Please try again.' : 'Unable to verify payment. Please check your email for confirmation.'}
                                </p>
                            </>
                        )}
                    </CardHeader>
                    <CardContent>
                        {status === 'success' && (
                            <p className="text-center text-sm text-muted-foreground">Redirecting to dashboard in 3 seconds...</p>
                        )}

                        {(status === 'timeout' || status === 'error' || status === 'expired') && (
                            <Button
                                onClick={() => navigate('/settings')}
                                className="w-full rounded-full"
                            >
                                Back to Settings
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default PaymentSuccessPage;
