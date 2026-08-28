import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Plus, Users, BarChart3, Settings, Mail, FileText, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

const walkthroughs = {
    howItWorks: {
        title: "How Tskflow works",
        steps: [
            {
                title: "Assign anyone",
                description: "Email is enough. They don't need an account yet.",
                icon: <Mail className="w-8 h-8" />
            },
            {
                title: "They prove it's done",
                description: "Done includes a note, not just a checkbox.",
                icon: <FileText className="w-8 h-8" />
            },
            {
                title: "You review",
                description: "Accept it, send it back, or it closes in 24 hours.",
                icon: <Eye className="w-8 h-8" />
            }
        ]
    },
    dashboard: {
        title: "Tskflow",
        steps: [
            {
                title: "Assign in one line",
                description: "Type who, what, and when in the bar below. They accept. You see it through.",
                icon: <Plus className="w-8 h-8" />
            }
        ]
    },
    analytics: {
        title: "Analytics",
        steps: [
            {
                title: "How the team is doing",
                description: "Completion, speed, and who is falling behind.",
                icon: <BarChart3 className="w-8 h-8" />
            }
        ]
    },
    settings: {
        title: "Settings",
        steps: [
            {
                title: "Your account",
                description: "Profile, plan, reminders, and Slack.",
                icon: <Settings className="w-8 h-8" />
            }
        ]
    },
    team: {
        title: "Team",
        steps: [
            {
                title: "Who reports to you",
                description: "You only see work you assigned them.",
                icon: <Users className="w-8 h-8" />
            }
        ]
    }
};

const OnboardingPopup = ({ page = 'dashboard', onClose }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const walkthrough = walkthroughs[page] || walkthroughs.dashboard;
    const steps = walkthrough.steps;
    const isLast = currentStep === steps.length - 1;
    const single = steps.length === 1;

    const nextStep = () => {
        if (!isLast) {
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
                <div className="bg-gradient-to-r from-teal-800 to-slate-800 p-6 text-white relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                            {steps[currentStep].icon}
                        </div>
                        <div>
                            {!single && <p className="text-white/70 text-sm">{walkthrough.title}</p>}
                            <h2 className="text-xl font-bold">{steps[currentStep].title}</h2>
                        </div>
                    </div>
                </div>

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

                    {!single && (
                        <div className="flex justify-center gap-2 mt-6">
                            {steps.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentStep(index)}
                                    className={`w-2 h-2 rounded-full transition-all ${
                                        index === currentStep
                                            ? 'bg-teal-600 w-6'
                                            : 'bg-gray-300 hover:bg-gray-400'
                                    }`}
                                    aria-label={`Step ${index + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-6 pb-6 flex items-center justify-between">
                    {single ? (
                        <Button
                            onClick={onClose}
                            className="rounded-full bg-gradient-to-r from-teal-800 to-slate-800 w-full"
                        >
                            Got it
                        </Button>
                    ) : (
                        <>
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
                                className="rounded-full bg-gradient-to-r from-teal-800 to-slate-800"
                            >
                                {isLast ? "Got it" : "Next"}
                                {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
                            </Button>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export const useOnboarding = (pageName) => {
    const storageKey = `Tskflow_onboarding_${pageName}`;
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
