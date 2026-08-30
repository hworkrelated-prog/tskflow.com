import React from 'react';
import { motion, useTransform } from 'framer-motion';
import { Check, Flag } from 'lucide-react';
import LandingPinBeat from '@/components/LandingPinBeat';
import { StoryTask } from '@/components/LandingCastMark';
import { TASKS } from '@/lib/landingCast';

const TASK = TASKS[0];

/** Beat 6: marked done, weakly — unless it becomes a red-flag escalation. */
export default function LandingHalfDone() {
    return (
        <LandingPinBeat testId="landing-half" label="Half done" spans={2.05}>
            {(progress) => <HalfFrame progress={progress} />}
        </LandingPinBeat>
    );
}

function HalfFrame({ progress }) {
    const weakOp = useTransform(progress, [0.08, 0.28, 0.62, 0.78], [0, 1, 1, 0.35]);
    const flagOp = useTransform(progress, [0.58, 0.78], [0, 1]);
    const flagScale = useTransform(progress, [0.58, 0.82], [0.6, 1]);
    const flagRot = useTransform(progress, [0.58, 0.82], [-18, -8]);

    return (
        <div className="landing-half-stage" data-testid="landing-half-done">
            <motion.div style={{ opacity: weakOp }} className="landing-half-card">
                <StoryTask task={TASK} weak>
                    <span className="landing-weak-check" aria-hidden data-testid="landing-weak-check">
                        <Check className="w-5 h-5" />
                    </span>
                </StoryTask>
            </motion.div>
            <motion.div
                className="landing-big-deal"
                data-testid="landing-big-deal"
                style={{ opacity: flagOp, scale: flagScale, rotate: flagRot }}
            >
                <Flag className="w-7 h-7" aria-hidden />
            </motion.div>
        </div>
    );
}
