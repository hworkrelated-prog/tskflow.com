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
import { Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '@/lib/utils';

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
            toast.error(getErrorMessage(error, 'Registration failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div data-testid="registration-page" className="min-h-screen gradient-mesh flex items-center justify-center p-6 relative">
            <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 hover:opacity-80 transition-opacity">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                    <Target className="w-6 h-6 text-white" />
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent" style={{ fontFamily: 'Outfit' }}>Tskflow</span>
            </Link>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="border-2 shadow-soft rounded-2xl">
                    <CardHeader className="space-y-2 text-center">
                        <CardTitle className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>
                            Welcome to Tskflow
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