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
    Plus,
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
            icon: <Clock className="w-6 h-6" />,
            title: "Auto Calendar Blocking",
            description: "High-priority tasks automatically block time on Google Calendar when accepted. No more forgotten deadlines.",
            highlight: true
        },
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
            title: "Company Email Only",
            description: "Teams require company email. Serious B2B execution, not personal todo lists."
        }
    ];

    const pricingPlans = [
        {
            name: "Free",
            price: "$0",
            period: "forever",
            description: "Start organizing your work today",
            features: [
                "Unlimited tasks",
                "Assign tasks to anyone via email",
                "Real-time notifications",
                "Basic analytics",
                "Mobile friendly"
            ],
            cta: "Get Started Free",
            popular: false
        },
        {
            name: "Pro",
            price: "$9",
            period: "per month",
            description: "For power users who need more",
            features: [
                "Everything in Free",
                "Google Calendar auto-blocking",
                "File & image attachments",
                "Advanced completion tracking",
                "Priority support"
            ],
            cta: "Start Pro",
            popular: true
        },
        {
            name: "Teams",
            price: "$12",
            period: "per user/month",
            description: "Built for teams who ship",
            features: [
                "Everything in Pro",
                "30-day free trial",
                "Company email required",
                "Performance leaderboards",
                "Org hierarchy & reporting",
                "Domain-based workspace",
                "Admin controls"
            ],
            cta: "Start Free Trial",
            popular: false,
            trial: true
        }
    ];

    // Visual Demo Component - Realistic App Walkthrough
    const VisualDemo = () => {
        const [step, setStep] = useState(0);
        const [isHovered, setIsHovered] = useState(false);
        
        useEffect(() => {
            if (isHovered) return;
            const timer = setInterval(() => {
                setStep((prev) => (prev + 1) % 5);
            }, 3500);
            return () => clearInterval(timer);
        }, [isHovered]);

        const scenario = {
            manager: { name: "You", avatar: "Y", role: "Founder" },
            team: [
                { name: "Sarah Chen", avatar: "SC", email: "sarah@startup.io", role: "Designer" },
                { name: "Mike Ross", avatar: "MR", email: "mike@startup.io", role: "Developer" },
                { name: "Alex Kim", avatar: "AK", email: "alex@startup.io", role: "Marketing" }
            ],
            task: "Design new landing page mockups"
        };

        return (
            <div 
                className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200/50"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* App Header - Mimics real Tskflow */}
                <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                            <Target className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-bold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Tskflow</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-600">
                            {scenario.manager.avatar}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="bg-gradient-to-br from-slate-50 to-white min-h-[400px] relative overflow-hidden">
                    
                    {/* Step 0: Dashboard Overview with 3 Views */}
                    <motion.div 
                        className="absolute inset-0 p-5"
                        animate={{ opacity: step === 0 ? 1 : 0, x: step === 0 ? 0 : -20 }}
                        transition={{ duration: 0.4 }}
                        style={{ pointerEvents: step === 0 ? 'auto' : 'none' }}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Your Tasks</h3>
                            </div>
                            <motion.button 
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg shadow-indigo-500/30"
                                animate={{ scale: [1, 1.05, 1] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                            >
                                <Plus className="w-4 h-4" /> New Task
                            </motion.button>
                        </div>

                        {/* Three View Tabs */}
                        <div className="flex gap-2 mb-4">
                            <div className="flex-1 bg-indigo-100 border-2 border-indigo-300 rounded-xl p-3 text-center cursor-pointer">
                                <div className="text-xl font-bold text-indigo-600">3</div>
                                <div className="text-xs font-medium text-indigo-700">Assigned</div>
                                <div className="text-[10px] text-indigo-500">Tasks for you</div>
                            </div>
                            <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-slate-300">
                                <div className="text-xl font-bold text-slate-600">2</div>
                                <div className="text-xs font-medium text-slate-700">Self Assigned</div>
                                <div className="text-[10px] text-slate-500">Your own tasks</div>
                            </div>
                            <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-slate-300">
                                <div className="text-xl font-bold text-slate-600">5</div>
                                <div className="text-xs font-medium text-slate-700">Delegated</div>
                                <div className="text-[10px] text-slate-500">Assigned to others</div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {[
                                { title: "Review pitch deck", from: "Sarah", priority: "High", time: "Due today", tag: "Assigned" },
                                { title: "Prepare board presentation", from: "Mike", priority: "Medium", time: "Due tomorrow", tag: "Assigned" }
                            ].map((task, i) => (
                                <motion.div 
                                    key={i} 
                                    className="bg-white rounded-xl p-3 border shadow-sm flex items-center gap-3"
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    <div className={`w-2 h-8 rounded-full ${task.priority === 'High' ? 'bg-red-500' : 'bg-amber-500'}`} />
                                    <div className="flex-1">
                                        <div className="font-medium text-sm text-slate-800">{task.title}</div>
                                        <div className="text-xs text-slate-500">From {task.from} • {task.time}</div>
                                    </div>
                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{task.tag}</span>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Step 1: Create New Task */}
                    <motion.div 
                        className="absolute inset-0 p-5"
                        animate={{ opacity: step === 1 ? 1 : 0, x: step === 1 ? 0 : 20 }}
                        transition={{ duration: 0.4 }}
                        style={{ pointerEvents: step === 1 ? 'auto' : 'none' }}
                    >
                        <div className="bg-white rounded-2xl border shadow-xl p-5 max-w-sm mx-auto">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl flex items-center justify-center">
                                    <Zap className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">New Task</h3>
                                    <p className="text-xs text-slate-500">Assign work to your team</p>
                                </div>
                            </div>
                            
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Task Title</label>
                                    <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200 flex items-center">
                                        <motion.span 
                                            className="text-slate-800 text-sm"
                                            initial={{ width: 0 }}
                                            animate={{ width: "auto" }}
                                        >
                                            {scenario.task}
                                        </motion.span>
                                        <motion.div 
                                            className="w-0.5 h-4 bg-indigo-500 ml-0.5"
                                            animate={{ opacity: [1, 0] }}
                                            transition={{ repeat: Infinity, duration: 0.6 }}
                                        />
                                    </div>
                                </div>
                                
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">Priority</label>
                                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm font-medium text-center">
                                            High
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs font-medium text-slate-500 mb-1 block">Due Date</label>
                                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 text-sm text-center">
                                            Tomorrow
                                        </div>
                                    </div>
                                </div>

                                <motion.button 
                                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 rounded-xl font-medium text-sm shadow-lg"
                                    animate={{ scale: [1, 1.02, 1] }}
                                    transition={{ repeat: Infinity, duration: 1.5 }}
                                >
                                    Continue to Assign →
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>

                    {/* Step 2: Assign to Team Member */}
                    <motion.div 
                        className="absolute inset-0 p-5"
                        animate={{ opacity: step === 2 ? 1 : 0, x: step === 2 ? 0 : 20 }}
                        transition={{ duration: 0.4 }}
                        style={{ pointerEvents: step === 2 ? 'auto' : 'none' }}
                    >
                        <div className="bg-white rounded-2xl border shadow-xl p-5 max-w-sm mx-auto">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center">
                                    <Users className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">Assign To</h3>
                                    <p className="text-xs text-slate-500">Choose a team member</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3 text-sm text-slate-600 border">
                                📋 {scenario.task}
                            </div>
                            
                            <div className="space-y-2">
                                {scenario.team.map((person, i) => (
                                    <motion.div 
                                        key={person.email}
                                        className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all ${
                                            i === 0 
                                                ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300 shadow-md' 
                                                : 'bg-white border border-slate-200 hover:border-slate-300'
                                        }`}
                                        initial={{ y: 10, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: i * 0.1 }}
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                                            i === 0 ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'
                                        }`}>
                                            {person.avatar}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-sm text-slate-800">{person.name}</div>
                                            <div className="text-xs text-slate-500">{person.role}</div>
                                        </div>
                                        {i === 0 && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center"
                                            >
                                                <CheckCircle2 className="w-4 h-4 text-white" />
                                            </motion.div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>

                            <motion.button 
                                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2.5 rounded-xl font-medium text-sm shadow-lg mt-4"
                                animate={{ scale: [1, 1.02, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5, delay: 0.5 }}
                            >
                                Assign to Sarah →
                            </motion.button>
                        </div>
                    </motion.div>

                    {/* Step 3: Email Notification & Task Completion */}
                    <motion.div 
                        className="absolute inset-0 p-5"
                        animate={{ opacity: step === 3 ? 1 : 0, x: step === 3 ? 0 : 20 }}
                        transition={{ duration: 0.4 }}
                        style={{ pointerEvents: step === 3 ? 'auto' : 'none' }}
                    >
                        <div className="flex gap-4 h-full">
                            {/* Email Preview */}
                            <motion.div 
                                className="flex-1 bg-white rounded-2xl border shadow-xl p-4 relative overflow-hidden"
                                initial={{ y: 20 }}
                                animate={{ y: 0 }}
                            >
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
                                <div className="flex items-center gap-2 mb-3 pt-1">
                                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                                        <Target className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="text-xs">
                                        <div className="font-medium text-slate-800">New task from You</div>
                                        <div className="text-slate-500">to sarah@startup.io</div>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 mb-3">
                                    <div className="font-medium text-sm text-slate-800 mb-1">{scenario.task}</div>
                                    <div className="flex gap-2">
                                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">High</span>
                                        <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Due Tomorrow</span>
                                    </div>
                                </div>
                                <motion.button 
                                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2 rounded-lg text-sm font-medium"
                                    animate={{ scale: [1, 1.03, 1] }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                >
                                    View Task in Tskflow →
                                </motion.button>
                            </motion.div>

                            {/* Completion */}
                            <motion.div 
                                className="flex-1 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 shadow-xl p-4"
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.3 }}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                                        <CheckCircle2 className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="text-sm font-medium text-green-800">Task Completed!</div>
                                </div>
                                <div className="bg-white rounded-xl p-3 mb-2">
                                    <div className="text-xs text-slate-500 mb-1">Sarah's note:</div>
                                    <div className="text-sm text-slate-700">"Mockups ready! Uploaded 3 variants to Figma. Let me know your thoughts 🎨"</div>
                                </div>
                                <div className="flex gap-2">
                                    <button className="flex-1 bg-green-500 text-white py-1.5 rounded-lg text-xs font-medium">
                                        ✓ Accept
                                    </button>
                                    <button className="flex-1 bg-white border border-slate-200 text-slate-600 py-1.5 rounded-lg text-xs font-medium">
                                        Request Changes
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>

                    {/* Step 4: Team Performance Leaderboard */}
                    <motion.div 
                        className="absolute inset-0 p-5"
                        animate={{ opacity: step === 4 ? 1 : 0, x: step === 4 ? 0 : 20 }}
                        transition={{ duration: 0.4 }}
                        style={{ pointerEvents: step === 4 ? 'auto' : 'none' }}
                    >
                        <div className="bg-white rounded-2xl border shadow-xl p-5 max-w-md mx-auto">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-yellow-100 to-orange-100 rounded-xl flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-yellow-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">Team Leaderboard</h3>
                                    <p className="text-xs text-slate-500">Who's shipping fastest this week?</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {[
                                    { name: "Sarah Chen", tasks: 8, avgTime: "1.2 days", rank: 1, trend: "+15%" },
                                    { name: "Mike Ross", tasks: 6, avgTime: "1.8 days", rank: 2, trend: "+8%" },
                                    { name: "Alex Kim", tasks: 5, avgTime: "2.1 days", rank: 3, trend: "+3%" }
                                ].map((person, i) => (
                                    <motion.div 
                                        key={person.name}
                                        className={`p-3 rounded-xl flex items-center gap-3 ${
                                            i === 0 ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200' : 'bg-slate-50'
                                        }`}
                                        initial={{ x: -20, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: i * 0.15 }}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                            i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-slate-300 text-slate-700' : 'bg-orange-200 text-orange-800'
                                        }`}>
                                            {person.rank}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-sm text-slate-800">{person.name}</div>
                                            <div className="text-xs text-slate-500">{person.tasks} tasks • {person.avgTime} avg</div>
                                        </div>
                                        <div className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                            {person.trend}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Team completion rate</span>
                                    <span className="font-bold text-green-600">94%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                                    <motion.div 
                                        className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: "94%" }}
                                        transition={{ duration: 1, delay: 0.5 }}
                                    />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Bottom Progress Bar */}
                <div className="bg-white border-t px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-600">
                            {['Dashboard', 'Create Task', 'Assign', 'Complete & Review', 'Leaderboard'][step]}
                        </span>
                        <span className="text-xs text-slate-400">{step + 1}/5</span>
                    </div>
                    <div className="flex gap-1.5">
                        {[0, 1, 2, 3, 4].map((i) => (
                            <button
                                key={i}
                                onClick={() => setStep(i)}
                                className={`h-1.5 rounded-full transition-all duration-300 ${
                                    step === i 
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 flex-[2]' 
                                        : step > i 
                                        ? 'bg-indigo-200 flex-1'
                                        : 'bg-slate-200 flex-1'
                                }`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    };

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
                            Tskflow
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
                            <VisualDemo />
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
                                <Card className={`h-full border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden group ${feature.highlight ? 'bg-gradient-to-br from-indigo-50 to-purple-50 ring-2 ring-indigo-500' : 'bg-white'}`}>
                                    <CardContent className="p-8">
                                        {feature.highlight && (
                                            <Badge className="mb-4 bg-indigo-600 text-white hover:bg-indigo-600 rounded-full text-xs">
                                                🔥 KEY FEATURE
                                            </Badge>
                                        )}
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300 ${feature.highlight ? 'bg-gradient-to-br from-indigo-600 to-purple-600' : 'bg-gradient-to-br from-indigo-500 to-purple-500'}`}>
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
                            See it in action
                        </h2>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                            Watch how Tskflow helps teams stay accountable
                        </p>
                    </motion.div>

                    <div className="max-w-3xl mx-auto mb-16">
                        <VisualDemo />
                    </div>

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
                            Fair pricing for
                            <br />
                            <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                                real outcomes
                            </span>
                        </h2>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                            We built Tskflow because team accountability shouldn't require enterprise software.
                            <br />
                            <span className="text-gray-500">Pay only for what you use. No surprises.</span>
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
                                {plan.trial && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full px-4 py-1 shadow-lg">
                                            30-Day Free Trial
                                        </Badge>
                                    </div>
                                )}
                                <Card className={`h-full rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                                    plan.popular 
                                        ? 'border-2 border-indigo-500 shadow-xl shadow-indigo-500/20' 
                                        : plan.trial
                                        ? 'border-2 border-green-500 shadow-xl shadow-green-500/20'
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
                                                    <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${feature.includes('Coming Soon') ? 'text-gray-400' : 'text-green-500'}`} />
                                                    <span className={feature.includes('Coming Soon') ? 'text-gray-500 italic' : 'text-gray-700'}>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        
                                        <Button 
                                            onClick={() => navigate('/register')}
                                            className={`w-full rounded-full h-12 font-semibold ${
                                                plan.popular 
                                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/25' 
                                                    : plan.trial
                                                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-500/25 text-white'
                                                    : ''
                                            }`}
                                            variant={plan.popular || plan.trial ? 'default' : 'outline'}
                                        >
                                            {plan.cta}
                                            <ChevronRight className="w-4 h-4 ml-2" />
                                        </Button>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                    
                    <p className="text-center text-gray-500 mt-8 text-sm">
                        All plans include unlimited task creation. Only features that exist today are listed.
                    </p>
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
                            Join teams who are already shipping faster with Tskflow. Start free, no credit card required.
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
                                    Tskflow
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
                                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
                                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-gray-400 text-sm">
                            © 2025 Tskflow. All rights reserved.
                        </p>
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Mail className="w-4 h-4" />
                            <span>hello@Tskflow.io</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
