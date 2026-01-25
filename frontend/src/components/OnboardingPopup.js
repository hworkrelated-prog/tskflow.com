import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Plus, CheckCircle, Users, BarChart3, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

const walkthroughs = {
    dashboard: {
        title: "Welcome to tskbox",
        steps: [
            {
                title: "Your Task Dashboard",
                description: "This is your command center. Tasks are organized into three columns based on their type.",
                icon: <CheckCircle className="w-8 h-8" />
            },
            {
                title: "Assigned to Me",
                description: "Tasks that others have assigned to you appear here. Accept, decline, or counter-propose deadlines.",
                icon: <Users className="w-8 h-8" />
            },
            {
                title: "Self-Assigned",
                description: "Personal tasks you've created for yourself. These are auto-accepted and ready to work on.",
                icon: <CheckCircle className="w-8 h-8" />
            },
            {
                title: "Delegated",
                description: "Tasks you've assigned to others. Track their progress and status from here.",
                icon: <Users className="w-8 h-8" />
            },
            {
                title: "Create New Tasks",
                description: "Click 'New Task' to create tasks. You can assign to yourself, team members, or anyone via email.",
                icon: <Plus className="w-8 h-8" />
            }
        ]
    },
    analytics: {
        title: "Analytics Overview",
        steps: [
            {
                title: "Your Productivity Insights",
                description: "Track how many tasks you've assigned, completed, and received over time.",
                icon: <BarChart3 className="w-8 h-8" />
            },
            {
                title: "Team Performance",
                description: "See detailed breakdowns per assignee: tasks assigned, completed, and completion rates.",
                icon: <Users className="w-8 h-8" />
            },
            {
                title: "Date Range Filter",
                description: "Adjust the date range to analyze different time periods.",
                icon: <Settings className="w-8 h-8" />
            }
        ]
    },
    settings: {
        title: "Account Settings",
        steps: [
            {
                title: "Manage Your Account",
                description: "Update your profile, password, and subscription settings here.",
                icon: <Settings className="w-8 h-8" />
            },
            {
                title: "Upgrade Plans",
                description: "Upgrade to Pro for unlimited tasks or Teams for organizational features.",
                icon: <CheckCircle className="w-8 h-8" />
            }
        ]
    },
    team: {
        title: "Team Management",
        steps: [
            {
                title: "Direct Reports",
                description: "Manage people who report to you. See their task metrics with privacy protection.",
                icon: <Users className="w-8 h-8" />
            },
            {
                title: "Organization Hierarchy",
                description: "Set who you report to and build your team structure.",
                icon: <Settings className="w-8 h-8" />
            }
        ]
    }
};

const OnboardingPopup = ({ page = 'dashboard', onClose }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const walkthrough = walkthroughs[page] || walkthroughs.dashboard;
    const steps = walkthrough.steps;

    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            onClose();
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                            {steps[currentStep].icon}
                        </div>
                        <div>
                            <p className="text-white/70 text-sm">{walkthrough.title}</p>
                            <h2 className="text-xl font-bold">{steps[currentStep].title}</h2>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="text-gray-600 text-base leading-relaxed"
                        >
                            {steps[currentStep].description}
                        </motion.p>
                    </AnimatePresence>

                    {/* Progress Dots */}
                    <div className="flex justify-center gap-2 mt-6">
                        {steps.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentStep(index)}
                                className={`w-2 h-2 rounded-full transition-all ${
                                    index === currentStep 
                                        ? 'bg-indigo-600 w-6' 
                                        : 'bg-gray-300 hover:bg-gray-400'
                                }`}
                            />
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={prevStep}
                            disabled={currentStep === 0}
                            className="rounded-full"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Back
                        </Button>
                        <Button
                            onClick={nextStep}
                            className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600"
                        >
                            {currentStep === steps.length - 1 ? "Get Started" : "Next"}
                            {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
                        </Button>
                    </div>
                    <div className="text-center">
                        <a 
                            href="mailto:hashim@unbiassly.com?subject=tskbox Feedback" 
                            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                        >
                            Report a Bug / Send Feedback
                        </a>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

// Hook to manage onboarding state
export const useOnboarding = (pageName) => {
    const storageKey = `tskbox_onboarding_${pageName}`;
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true);

    useEffect(() => {
        const seen = localStorage.getItem(storageKey);
        if (!seen) {
            setShowOnboarding(true);
            setHasSeenOnboarding(false);
        }
    }, [storageKey]);

    const closeOnboarding = () => {
        localStorage.setItem(storageKey, 'true');
        setShowOnboarding(false);
        setHasSeenOnboarding(true);
    };

    const reopenOnboarding = () => {
        setShowOnboarding(true);
    };

    return { showOnboarding, closeOnboarding, reopenOnboarding, hasSeenOnboarding };
};

export default OnboardingPopup;
