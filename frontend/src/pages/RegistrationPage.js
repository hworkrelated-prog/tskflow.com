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

const RegistrationPage = () => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: ''
    });
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await axios.post(`${API}/auth/register`, formData);
            
            if (response.data.verification_code) {
                toast.success(`Verification code: ${response.data.verification_code}`);
            } else {
                toast.success('Verification code sent to your email');
            }
            
            navigate('/verify-email', { state: { email: formData.email } });
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="registration-page" className="min-h-screen gradient-mesh flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="border-2 shadow-soft rounded-2xl">
                    <CardHeader className="space-y-2 text-center">
                        <CardTitle className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>
                            Welcome to Task Hub
                        </CardTitle>
                        <CardDescription className="text-base">
                            Create your account to start managing tasks
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
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
                                    className="rounded-xl h-12"
                                />
                            </div>
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
                                {loading ? 'Creating account...' : 'Create Account'}
                            </Button>
                        </form>
                        <div className="mt-6 text-center">
                            <button
                                data-testid="go-to-login"
                                type="button"
                                className="text-sm text-muted-foreground hover:text-foreground underline"
                                onClick={() => navigate('/login')}
                            >
                                Already have an account? Sign in
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default RegistrationPage;