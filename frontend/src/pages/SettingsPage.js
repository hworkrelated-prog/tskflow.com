import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Crown, Check } from 'lucide-react';
import { motion } from 'framer-motion';

const SettingsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const features = {
        free: [
            'Up to 5 active tasks',
            'Basic task management',
            'Email notifications',
            'Task analytics',
            'Assign to anyone'
        ],
        pro: [
            'Unlimited tasks',
            'Priority support',
            'Advanced analytics',
            'Custom categories',
            'Export reports',
            'Assign to anyone'
        ],
        teams: [
            'Everything in Pro',
            'Team workspace (domain-based)',
            'Collaborate within company only',
            'Team analytics dashboard',
            'Shared task visibility',
            'Admin controls',
            'Dedicated account manager'
        ]
    };

    return (
        <div data-testid="settings-page" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
            <header className="glass-header border-b">
                <div className="container mx-auto px-6 py-4">
                    <Button
                        data-testid="back-button"
                        variant="ghost"
                        onClick={() => navigate('/')}
                        className="rounded-full"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Hub
                    </Button>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 max-w-4xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-8"
                >
                    <div className="text-center">
                        <h1 className="text-5xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>Settings</h1>
                        <p className="text-muted-foreground text-lg">Manage your account and subscription</p>
                    </div>

                    <Card className="border-2 shadow-soft rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Account Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Name</p>
                                <p className="font-semibold text-lg">{user?.name}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Email</p>
                                <p className="font-semibold text-lg">{user?.email}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Current Plan</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {user?.subscription_tier === 'pro' ? (
                                        <Badge className="subscription-badge-pro rounded-full px-3 py-1 text-sm font-semibold flex items-center gap-1">
                                            <Crown className="w-4 h-4" />
                                            PRO
                                        </Badge>
                                    ) : (
                                        <Badge className="subscription-badge-free rounded-full px-3 py-1 text-sm font-semibold">
                                            FREE
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div>
                        <h2 className="text-3xl font-bold mb-6 text-center" style={{ fontFamily: 'Outfit' }}>Subscription Plans</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Free Plan */}
                            <Card className={`border-2 rounded-2xl ${
                                user?.subscription_tier === 'free' 
                                    ? 'border-primary shadow-lg' 
                                    : 'border-border shadow-soft'
                            }`}>
                                <CardHeader>
                                    <CardTitle className="text-2xl" style={{ fontFamily: 'Outfit' }}>Free</CardTitle>
                                    <CardDescription>
                                        <span className="text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>$0</span>
                                        <span className="text-muted-foreground">/month</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ul className="space-y-3">
                                        {features.free.map((feature, index) => (
                                            <li key={index} className="flex items-center gap-2">
                                                <Check className="w-5 h-5 text-green-600" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {user?.subscription_tier === 'free' && (
                                        <Badge className="w-full justify-center py-2 rounded-full">
                                            Current Plan
                                        </Badge>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Pro Plan */}
                            <Card className={`border-2 rounded-2xl ${
                                user?.subscription_tier === 'pro' 
                                    ? 'border-primary shadow-lg' 
                                    : 'border-border shadow-soft'
                            }`}>
                                <CardHeader>
                                    <CardTitle className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                        <Crown className="w-6 h-6 text-amber-500" />
                                        Pro
                                    </CardTitle>
                                    <CardDescription>
                                        <span className="text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>$9</span>
                                        <span className="text-muted-foreground">/month</span>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ul className="space-y-3">
                                        {features.pro.map((feature, index) => (
                                            <li key={index} className="flex items-center gap-2">
                                                <Check className="w-5 h-5 text-green-600" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {user?.subscription_tier === 'pro' ? (
                                        <Badge className="w-full justify-center py-2 rounded-full subscription-badge-pro">
                                            Current Plan
                                        </Badge>
                                    ) : (
                                        <Button className="w-full rounded-full h-12 font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
                                            Upgrade to Pro
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </motion.div>
            </main>
        </div>
    );
};

export default SettingsPage;