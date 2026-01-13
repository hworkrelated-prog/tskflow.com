import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

const ForgotPassword = () => {
    const [step, setStep] = useState(1); // 1: email, 2: reset code
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [resetCode, setResetCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayedCode, setDisplayedCode] = useState('');
    const navigate = useNavigate();

    const handleRequestReset = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API}/auth/forgot-password`, { email });
            
            if (response.data.reset_code) {
                // Email not configured - show code directly
                setDisplayedCode(response.data.reset_code);
                toast.success('Reset code generated');
            } else {
                toast.success('Reset code sent to your email');
            }
            setStep(2);
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to request reset');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        
        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        try {
            await axios.post(`${API}/auth/reset-password`, {
                email,
                reset_code: resetCode,
                new_password: newPassword
            });
            toast.success('Password reset successful! Please login');
            navigate('/login');
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to reset password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="forgot-password-page" className="flex min-h-screen">
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
                                {step === 1 ? 'Forgot Password' : 'Reset Password'}
                            </CardTitle>
                            <CardDescription className="text-base">
                                {step === 1 ? 'Enter your email to receive a reset code' : 'Enter the reset code and your new password'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {step === 1 ? (
                                <form onSubmit={handleRequestReset} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            data-testid="reset-email-input"
                                            type="email"
                                            placeholder="name@company.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            className="rounded-md"
                                        />
                                    </div>
                                    <Button
                                        data-testid="request-reset-button"
                                        type="submit"
                                        className="w-full rounded-md font-medium"
                                        disabled={loading}
                                    >
                                        {loading ? 'Sending...' : 'Send Reset Code'}
                                    </Button>
                                </form>
                            ) : (
                                <form onSubmit={handleResetPassword} className="space-y-4">
                                    {displayedCode && (
                                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                                            <p className="text-sm text-yellow-800 mb-1">Your reset code:</p>
                                            <p className="text-2xl font-bold text-yellow-900" style={{ fontFamily: 'JetBrains Mono' }}>
                                                {displayedCode}
                                            </p>
                                            <p className="text-xs text-yellow-700 mt-1">Copy this code and enter it below</p>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label htmlFor="resetCode">Reset Code</Label>
                                        <Input
                                            id="resetCode"
                                            data-testid="reset-code-input"
                                            type="text"
                                            placeholder="Enter 6-digit code"
                                            value={resetCode}
                                            onChange={(e) => setResetCode(e.target.value)}
                                            required
                                            className="rounded-md"
                                            maxLength={6}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="newPassword">New Password</Label>
                                        <Input
                                            id="newPassword"
                                            data-testid="new-password-input"
                                            type="password"
                                            placeholder="Enter new password"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            required
                                            className="rounded-md"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                                        <Input
                                            id="confirmPassword"
                                            data-testid="confirm-password-input"
                                            type="password"
                                            placeholder="Confirm new password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            className="rounded-md"
                                        />
                                    </div>
                                    <Button
                                        data-testid="reset-password-button"
                                        type="submit"
                                        className="w-full rounded-md font-medium"
                                        disabled={loading}
                                    >
                                        {loading ? 'Resetting...' : 'Reset Password'}
                                    </Button>
                                </form>
                            )}
                            <div className="mt-4 text-center">
                                <button
                                    data-testid="back-to-login"
                                    type="button"
                                    className="text-sm text-muted-foreground hover:text-foreground underline inline-flex items-center gap-1"
                                    onClick={() => navigate('/login')}
                                >
                                    <ArrowLeft className="w-3 h-3" />
                                    Back to Login
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
                        <h1 className="text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit' }}>Reset Your Password</h1>
                        <p className="text-xl">Get back to tracking execution</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
