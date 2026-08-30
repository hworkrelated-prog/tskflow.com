import React from 'react';
import { motion, useTransform } from 'framer-motion';
import LandingPinBeat from '@/components/LandingPinBeat';
import LandingCastMark, { StoryTask } from '@/components/LandingCastMark';
import { CAST, TASKS } from '@/lib/landingCast';

const REST = [
    { y: 108, r: -1, x: 0, z: 1 },
    { y: 52, r: 3, x: 8, z: 2 },
    { y: 26, r: -2, x: -6, z: 3 },
    { y: 0, r: 4, x: 5, z: 4 },
];

/** Beat 4: Friday ticks in. Task 1 sits buried, untouched. */
export default function LandingDeadline() {
    return (
        <LandingPinBeat testId="landing-deadline" label="Deadline" spans={2.05}>
            {(progress) => <DeadlineFrame progress={progress} />}
        </LandingPinBeat>
    );
}

function DeadlineFrame({ progress }) {
    const tick = useTransform(progress, [0.08, 0.55], [-90, 132]);
    const dueGlow = useTransform(progress, [0.35, 0.6], [0, 1]);
    const bury = useTransform(progress, [0.45, 0.8], [0, 1]);

    return (
        <div className="landing-deadline" data-testid="landing-deadline-frame">
            <motion.div className="landing-deadline-clock" data-testid="landing-due-clock" style={{ opacity: dueGlow }}>
                <svg viewBox="0 0 64 64" aria-hidden>
                    <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="2.4" />
                    <motion.g style={{ rotate: tick }} transformOrigin="32px 32px">
                        <line
                            x1="32"
                            y1="32"
                            x2="32"
                            y2="14"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                        />
                    </motion.g>
                    <circle cx="32" cy="32" r="2.4" fill="currentColor" />
                </svg>
                <span className="landing-clockchip is-overdue" data-testid="landing-due-miss">Friday</span>
            </motion.div>

            <div className="landing-tray landing-tray--bare">
                <header className="landing-tray-head">
                    <LandingCastMark who="maya" />
                    <span>{CAST.maya.name}</span>
                </header>
                <div className="landing-tray-stack landing-tray-stack--spread">
                    {TASKS.map((task, i) => (
                        <BuriedCard
                            key={task.id}
                            task={task}
                            rest={REST[i]}
                            isFirst={task.id === 't1'}
                            progress={progress}
                            bury={bury}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function BuriedCard({ task, rest, isFirst, progress, bury }) {
    const y = useTransform(progress, [0, 0.4], [rest.y - 8, rest.y]);
    const dim = useTransform(bury, (v) => (isFirst ? 1 - v * 0.55 : 1));
    const scale = useTransform(bury, (v) => (isFirst ? 1 - v * 0.08 : 1));

    return (
        <motion.div
            className={`landing-tray-card${isFirst ? ' is-buried-slot' : ''}`}
            style={{ y, opacity: dim, scale, rotate: rest.r, x: rest.x, zIndex: rest.z }}
            data-testid={`landing-deadline-${task.id}`}
        >
            <StoryTask task={isFirst ? task : { ...task, due: undefined }} buried={isFirst} />
        </motion.div>
    );
}
