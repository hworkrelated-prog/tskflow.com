import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
    CheckCircle2, 
    ArrowRight, 
    Zap, 
    Users, 
    BarChart3, 
    Shield, 
    Clock, 
    GitBranch,
    ChevronRight,
    Play,
    Sparkles,
    Target,
    TrendingUp,
    Mail,
    Twitter,
    Linkedin,
    Github
} from 'lucide-react';

const LandingPage = () => {
    const navigate = useNavigate();
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const features = [
        {
            icon: <Zap className="w-6 h-6" />,
            title: "Lightning Fast",
            description: "Create and assign tasks in seconds. No complex setup, just pure productivity."
        },
        {
            icon: <Users className="w-6 h-6" />,
            title: "Team Collaboration",
            description: "Assign tasks to anyone via email. They'll receive instant notifications."
        },
        {
            icon: <GitBranch className="w-6 h-6" />,
            title: "Org Hierarchy",
            description: "Build your reporting structure. Track direct reports and their progress."
        },
        {
            icon: <BarChart3 className="w-6 h-6" />,
            title: "Smart Analytics",
            description: "Get insights into task completion rates, team performance, and trends."
        },
        {
            icon: <Shield className="w-6 h-6" />,
            title: "Privacy First",
            description: "See only what you need. Your team's private tasks stay private."
        },
        {
            icon: <Clock className="w-6 h-6" />,
            title: "Time Tracking",
            description: "Monitor average completion times and identify bottlenecks."
        }
    ];

    const pricingPlans = [
        {
            name: "Free",
            price: "$0",
            period: "forever",
            description: "Perfect for individuals getting started",
            features: [
                "Up to 5 active tasks",
                "Basic task management",
                "Email notifications",
                "Assign to anyone",
                "Mobile friendly"
            ],
            cta: "Start Free",
            popular: false
        },
        {
            name: "Pro",
            price: "$9",
            period: "per month",
            description: "For power users who need more",
            features: [
                "Unlimited tasks",
                "Priority support",
                "Advanced analytics",
                "Custom categories",
                "Export reports",
                "API access"
            ],
            cta: "Go Pro",
            popular: true
        },
        {
            name: "Teams",
            price: "$12",
            period: "per user/month",
            description: "For organizations that scale",
            features: [
                "Everything in Pro",
                "Team workspace",
                "Org hierarchy & direct reports",
                "Team analytics dashboard",
                "Admin controls",
                "SSO & advanced security"
            ],
            cta: "Start Team Trial",
            popular: false
        }
    ];

    const stats = [
        { value: "Simple", label: "Task Assignment" },
        { value: "Clear", label: "Team Visibility" },
        { value: "Fast", label: "Task Completion" },
        { value: "Easy", label: "Progress Tracking" }
    ];

    return (
        <div className="min-h-screen bg-white overflow-x-hidden">
            {/* Floating Navigation */}
            <motion.nav 
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
                    isScrolled 
                        ? 'bg-white/80 backdrop-blur-xl shadow-lg border-b' 
                        : 'bg-transparent'
                }`}
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
                            <Target className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent" style={{ fontFamily: 'Outfit' }}>
                            tskbox
                        </span>
                    </div>
                    <div className="hidden md:flex items-center gap-8">
                        <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">Features</a>
                        <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">Pricing</a>
                        <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">How It Works</a>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button 
                            variant="ghost" 
                            onClick={() => navigate('/login')}
                            className="rounded-full font-medium"
                        >
                            Sign In
                        </Button>
                        <Button 
                            onClick={() => navigate('/register')}
                            className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/25 font-medium"
                        >
                            Get Started Free
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </motion.nav>

            {/* Hero Section */}
            <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
                {/* Background Elements */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50" />
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-indigo-400/20 to-purple-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-blue-400/20 to-cyan-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
                
                {/* Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]" />

                <div className="container mx-auto px-6 relative z-10">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8 }}
                        >
                            <Badge className="mb-6 bg-indigo-100 text-indigo-700 hover:bg-indigo-100 rounded-full px-4 py-2 text-sm font-medium">
                                <Sparkles className="w-4 h-4 mr-2" />
                                Simple. Powerful. Effective.
                            </Badge>
                            
                            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6" style={{ fontFamily: 'Outfit' }}>
                                Tasks flow.
                                <br />
                                <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                                    Teams grow.
                                </span>
                            </h1>
                            
                            <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-lg">
                                The task management platform built for modern teams. Assign, track, and complete work with clarity. See who reports to whom, without the chaos.
                            </p>
                            
                            <div className="flex flex-col sm:flex-row gap-4 mb-12">
                                <Button 
                                    onClick={() => navigate('/register')}
                                    size="lg"
                                    className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-xl shadow-indigo-500/30 h-14 px-8 text-lg font-semibold"
                                >
                                    Get Started
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>
                                <Button 
                                    variant="outline"
                                    size="lg"
                                    className="rounded-full h-14 px-8 text-lg font-medium border-2 hover:bg-gray-50"
                                    onClick={() => navigate('/login')}
                                >
                                    <Play className="w-5 h-5 mr-2" />
                                    Sign In
                                </Button>
                            </div>

                            {/* Value Props */}
                            <div className="flex flex-wrap gap-6">
                                <div className="flex items-center gap-2 text-gray-600">
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    <span>Free forever plan</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-600">
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    <span>No credit card required</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-600">
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    <span>Setup in 2 minutes</span>
                                </div>
                            </div>
                        </motion.div>

                        {/* Hero Image / App Preview */}
                        <motion.div
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="relative"
                        >
                            <div className="relative">
                                {/* Browser Chrome */}
                                <div className="bg-white rounded-2xl shadow-2xl shadow-indigo-500/20 overflow-hidden border">
                                    <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b">
                                        <div className="flex gap-2">
                                            <div className="w-3 h-3 rounded-full bg-red-400" />
                                            <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                            <div className="w-3 h-3 rounded-full bg-green-400" />
                                        </div>
                                        <div className="flex-1 mx-4">
                                            <div className="bg-white rounded-lg px-4 py-1.5 text-sm text-gray-500 border">
                                                tskbox.com
                                            </div>
                                        </div>
                                    </div>
                                    <img 
                                        src="https://images.pexels.com/photos/5257005/pexels-photo-5257005.jpeg?auto=compress&cs=tinysrgb&w=800" 
                                        alt="tskbox Dashboard"
                                        className="w-full h-auto"
                                    />
                                </div>

                                {/* Floating Cards */}
                                <motion.div 
                                    className="absolute -left-8 top-1/4 bg-white rounded-xl shadow-xl p-4 border"
                                    animate={{ y: [0, -10, 0] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">Task Completed!</p>
                                            <p className="text-xs text-gray-500">Q4 Planning Doc</p>
                                        </div>
                                    </div>
                                </motion.div>

                                <motion.div 
                                    className="absolute -right-4 bottom-1/4 bg-white rounded-xl shadow-xl p-4 border"
                                    animate={{ y: [0, 10, 0] }}
                                    transition={{ duration: 3, repeat: Infinity, delay: 1.5 }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">Productivity Up</p>
                                            <p className="text-xs text-green-600 font-medium">+34% this week</p>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-16 bg-gradient-to-r from-indigo-600 to-purple-600 relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px]" />
                <div className="container mx-auto px-6 relative z-10">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        {stats.map((stat, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="text-center"
                            >
                                <p className="text-4xl md:text-5xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>
                                    {stat.value}
                                </p>
                                <p className="text-indigo-200 font-medium">{stat.label}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-24 bg-gray-50">
                <div className="container mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <Badge className="mb-4 bg-indigo-100 text-indigo-700 hover:bg-indigo-100 rounded-full px-4 py-2">
                            Features
                        </Badge>
                        <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit' }}>
                            Everything you need to
                            <br />
                            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                                ship faster
                            </span>
                        </h2>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                            Built for teams who value clarity, speed, and getting things done without the overhead.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                            >
                                <Card className="h-full border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white rounded-2xl overflow-hidden group">
                                    <CardContent className="p-8">
                                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300">
                                            {feature.icon}
                                        </div>
                                        <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'Outfit' }}>
                                            {feature.title}
                                        </h3>
                                        <p className="text-gray-600 leading-relaxed">
                                            {feature.description}
                                        </p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section id="how-it-works" className="py-24 bg-white">
                <div className="container mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <Badge className="mb-4 bg-purple-100 text-purple-700 hover:bg-purple-100 rounded-full px-4 py-2">
                            How It Works
                        </Badge>
                        <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit' }}>
                            Three steps to
                            <br />
                            <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                                team clarity
                            </span>
                        </h2>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 relative">
                        {/* Connection Line */}
                        <div className="hidden md:block absolute top-24 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300" />
                        
                        {[
                            { step: "01", title: "Create & Assign", description: "Create tasks and assign them to yourself or anyone via email. Set priorities and due dates." },
                            { step: "02", title: "Build Your Team", description: "Set up your org hierarchy. Add direct reports and define who reports to whom." },
                            { step: "03", title: "Track & Deliver", description: "Monitor progress, get insights, and celebrate wins. All with privacy respected." }
                        ].map((item, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.2 }}
                                className="relative text-center"
                            >
                                <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-6 relative z-10">
                                    {item.step}
                                </div>
                                <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'Outfit' }}>
                                    {item.title}
                                </h3>
                                <p className="text-gray-600">
                                    {item.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="py-24 bg-gray-50">
                <div className="container mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <Badge className="mb-4 bg-green-100 text-green-700 hover:bg-green-100 rounded-full px-4 py-2">
                            Pricing
                        </Badge>
                        <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit' }}>
                            Simple, transparent
                            <br />
                            <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                                pricing
                            </span>
                        </h2>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                            Start free. Upgrade when you're ready. No hidden fees.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {pricingPlans.map((plan, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="relative"
                            >
                                {plan.popular && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full px-4 py-1 shadow-lg">
                                            Most Popular
                                        </Badge>
                                    </div>
                                )}
                                <Card className={`h-full rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                                    plan.popular 
                                        ? 'border-2 border-indigo-500 shadow-xl shadow-indigo-500/20' 
                                        : 'border shadow-lg hover:shadow-xl'
                                }`}>
                                    <CardContent className="p-8">
                                        <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Outfit' }}>
                                            {plan.name}
                                        </h3>
                                        <div className="mb-4">
                                            <span className="text-5xl font-bold" style={{ fontFamily: 'Outfit' }}>
                                                {plan.price}
                                            </span>
                                            <span className="text-gray-500 ml-2">/{plan.period}</span>
                                        </div>
                                        <p className="text-gray-600 mb-6">{plan.description}</p>
                                        
                                        <ul className="space-y-4 mb-8">
                                            {plan.features.map((feature, i) => (
                                                <li key={i} className="flex items-center gap-3">
                                                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                                                    <span className="text-gray-700">{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        
                                        <Button 
                                            onClick={() => navigate('/register')}
                                            className={`w-full rounded-full h-12 font-semibold ${
                                                plan.popular 
                                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/25' 
                                                    : ''
                                            }`}
                                            variant={plan.popular ? 'default' : 'outline'}
                                        >
                                            {plan.cta}
                                            <ChevronRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear_gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px]" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl" />
                
                <div className="container mx-auto px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center max-w-3xl mx-auto"
                    >
                        <h2 className="text-4xl md:text-6xl font-bold text-white mb-6" style={{ fontFamily: 'Outfit' }}>
                            Ready to get organized?
                        </h2>
                        <p className="text-xl text-white/80 mb-10">
                            Join teams who are already shipping faster with tskbox. Start free, no credit card required.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Button 
                                onClick={() => navigate('/register')}
                                size="lg"
                                className="rounded-full bg-white text-indigo-600 hover:bg-gray-100 shadow-xl h-14 px-8 text-lg font-semibold"
                            >
                                Get Started Free
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-16">
                <div className="container mx-auto px-6">
                    <div className="grid md:grid-cols-4 gap-12 mb-12">
                        <div>
                            <div className="flex items-center gap-2 mb-6">
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
                                    <Target className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-2xl font-bold" style={{ fontFamily: 'Outfit' }}>
                                    tskbox
                                </span>
                            </div>
                            <p className="text-gray-400 mb-6">
                                The task management platform built for modern teams who value clarity and speed.
                            </p>
                            <div className="flex gap-4">
                                <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                                    <Twitter className="w-5 h-5" />
                                </a>
                                <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                                    <Linkedin className="w-5 h-5" />
                                </a>
                                <a href="#" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors">
                                    <Github className="w-5 h-5" />
                                </a>
                            </div>
                        </div>
                        
                        <div>
                            <h4 className="font-semibold mb-4">Product</h4>
                            <ul className="space-y-3 text-gray-400">
                                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Integrations</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Changelog</a></li>
                            </ul>
                        </div>
                        
                        <div>
                            <h4 className="font-semibold mb-4">Company</h4>
                            <ul className="space-y-3 text-gray-400">
                                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                            </ul>
                        </div>
                        
                        <div>
                            <h4 className="font-semibold mb-4">Legal</h4>
                            <ul className="space-y-3 text-gray-400">
                                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-gray-400 text-sm">
                            © 2025 tskbox. All rights reserved.
                        </p>
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Mail className="w-4 h-4" />
                            <span>hello@tskbox.io</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
