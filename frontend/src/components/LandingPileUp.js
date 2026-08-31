import React from 'react';
import { motion, useTransform } from 'framer-motion';
import LandingPinBeat from '@/components/LandingPinBeat';
import LandingCastMark, { StoryTask } from '@/components/LandingCastMark';
import { CAST, TASKS } from '@/lib/landingCast';

const DROP = [
    { at: 0.06, restY: 86, restR: -2.5, restX: -2, z: 1 },
    { at: 0.24, restY: 56, restR: 3.5, restX: 8, z: 2 },
    { at: 0.42, restY: 28, restR: -3, restX: -6, z: 3 },
    { at: 0.6, restY: 0, restR: 2.2, restX: 5, z: 4 },
];

/** Beat 3: Maya's tray. Task 1 lands, then 2, 3, 4 stack on top before it's touched. */
export default function LandingPileUp() {
    return (
        <LandingPinBeat
            testId="landing-pile"
            label="Pileup"
            caption="Then more work landed on top of it."
            spans={2.3}
        >
            {(progress) => <Tray progress={progress} />}
        </LandingPinBeat>
    );
}

function Tray({ progress }) {
    return (
        <div className="landing-tray" data-testid="landing-pile-stage">
            <header className="landing-tray-head">
                <LandingCastMark who="maya" />
                <span>{CAST.maya.name}</span>
            </header>
            <div className="landing-tray-stack">
                {TASKS.map((task, i) => (
                    <DropCard key={task.id} task={task} drop={DROP[i]} progress={progress} />
                ))}
            </div>
        </div>
    );
}

function DropCard({ task, drop, progress }) {
    const y = useTransform(progress, [drop.at, drop.at + 0.16], [-120, drop.restY]);
    const opacity = useTransform(progress, [drop.at, drop.at + 0.1], [0, 1]);
    const rotate = useTransform(progress, [drop.at, drop.at + 0.16], [10, drop.restR]);
    const x = useTransform(progress, [drop.at, drop.at + 0.16], [0, drop.restX]);
    const scale = useTransform(progress, [drop.at, drop.at + 0.12], [0.92, 1]);

    return (
        <motion.div
            className="landing-tray-card"
            style={{ y, opacity, rotate, x, scale, zIndex: drop.z }}
            data-testid={`landing-pile-${task.id}`}
        >
            <StoryTask task={task} />
        </motion.div>
    );
}
