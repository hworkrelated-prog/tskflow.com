import React from 'react';
import { motion, useTransform } from 'framer-motion';
import LandingPinBeat from '@/components/LandingPinBeat';
import { StoryTask } from '@/components/LandingCastMark';
import { TASKS } from '@/lib/landingCast';

const CHAOS = [
    { x: -72, y: 38, r: -16 },
    { x: 64, y: -28, r: 12 },
    { x: -18, y: 96, r: 8 },
    { x: 36, y: 118, r: -11 },
];

const CALM = [
    { x: 0, y: 0, r: 0 },
    { x: 0, y: 78, r: 0 },
    { x: 0, y: 156, r: 0 },
    { x: 0, y: 234, r: 0 },
];

/** Beat 7: the turn. Messy pile becomes a calm TskFlow board. */
export default function LandingTurn() {
    return (
        <LandingPinBeat
            testId="landing-turn"
            label="TskFlow"
            caption="TskFlow keeps the yes."
            spans={2.7}
            tone="turn"
        >
            {(progress) => <TurnFrame progress={progress} />}
        </LandingPinBeat>
    );
}

function TurnFrame({ progress }) {
    const chaosOp = useTransform(progress, [0, 0.22, 0.55], [1, 0.7, 0]);
    const calmOp = useTransform(progress, [0.28, 0.62, 1], [0, 0.85, 1]);
    const markOp = useTransform(progress, [0.48, 0.68], [0, 1]);
    const boardOp = useTransform(progress, [0.2, 0.7], [0.55, 1]);

    return (
        <div className="landing-turn" data-testid="landing-turn-frame">
            <motion.div className="landing-turn-chaos" style={{ opacity: chaosOp }} aria-hidden />
            <motion.div className="landing-turn-calm" style={{ opacity: calmOp }} aria-hidden />
            <motion.p className="landing-turn-mark" style={{ opacity: markOp }}>TskFlow</motion.p>
            <motion.div className="landing-turn-board" style={{ opacity: boardOp }}>
                {TASKS.map((task, i) => (
                    <TurnCard key={task.id} task={task} chaos={CHAOS[i]} calm={CALM[i]} progress={progress} />
                ))}
            </motion.div>
        </div>
    );
}

function TurnCard({ task, chaos, calm, progress }) {
    const x = useTransform(progress, [0.18, 0.72], [chaos.x, calm.x]);
    const y = useTransform(progress, [0.18, 0.72], [chaos.y, calm.y]);
    const rotate = useTransform(progress, [0.18, 0.72], [chaos.r, calm.r]);
    const radius = useTransform(progress, [0.3, 0.7], [18, 14]);

    return (
        <motion.div
            className="landing-turn-card"
            style={{ x, y, rotate, borderRadius: radius }}
            data-testid={`landing-turn-${task.id}`}
        >
            <StoryTask task={{ ...task, due: task.due || 'Fri' }} />
        </motion.div>
    );
}
