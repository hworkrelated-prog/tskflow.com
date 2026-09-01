import React from 'react';
import { motion, useTransform } from 'framer-motion';
import LandingPinBeat from '@/components/LandingPinBeat';

const QUESTIONS = [
    'Did you do this?',
    "What's the status?",
    'Any update?',
    'Did you remember?',
];

export default function LandingPayoff() {
    return (
        <LandingPinBeat
            testId="landing-payoff"
            label="Imagine not having to ask."
            spans={2.15}
            tone="calm"
        >
            {(progress) => <PayoffFrame progress={progress} />}
        </LandingPinBeat>
    );
}

function PayoffFrame({ progress }) {
    const know = useTransform(progress, [0.55, 0.78], [0, 1]);
    const after = useTransform(progress, [0.72, 0.92], [0, 1]);

    return (
        <div className="landing-payoff" data-testid="landing-payoff-frame">
            <h2 className="landing-payoff-title" data-testid="landing-payoff-title">
                Imagine not having to ask.
            </h2>
            <ul className="landing-payoff-qs">
                {QUESTIONS.map((line, i) => (
                    <FadingQ key={line} line={line} index={i} progress={progress} />
                ))}
            </ul>
            <motion.p className="landing-payoff-know" style={{ opacity: know }} data-testid="landing-payoff-know">
                You already know.
            </motion.p>
            <motion.p className="landing-payoff-after" style={{ opacity: after }} data-testid="landing-payoff-after">
                You can finally manage the business instead of managing reminders.
            </motion.p>
        </div>
    );
}

function FadingQ({ line, index, progress }) {
    const opacity = useTransform(progress, [0.08 + index * 0.08, 0.22 + index * 0.1, 0.52], [0, 1, 0]);
    const y = useTransform(progress, [0.08 + index * 0.08, 0.5], [10, -8]);
    return (
        <motion.li style={{ opacity, y }} data-testid={`landing-payoff-q-${index}`}>
            {line}
        </motion.li>
    );
}
