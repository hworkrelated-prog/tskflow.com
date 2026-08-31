import React from 'react';
import { motion, useTransform } from 'framer-motion';
import { JarvisIcon } from '@/components/JarvisIcon';
import CompletionRing from '@/components/CompletionRing';
import LandingPinBeat from '@/components/LandingPinBeat';
import LandingCastMark from '@/components/LandingCastMark';
import { CAST, TASKS, GROUP_BOARD, GROUP_AVG, WEEK } from '@/lib/landingCast';

const TASK = TASKS[0];
const STEPS = ['Assigned', 'Tracked', 'Done'];

/** Beats 8–11: assigner calm, calendar fit, overload chat, group race. */
export default function LandingPeace() {
    return (
        <>
            <LandingPinBeat
                testId="landing-assigner"
                label="Assigned. Tracked. Done."
                caption="Assigned. Tracked. Done."
                spans={1.85}
                tone="calm"
            >
                {(progress) => <AssignerFrame progress={progress} />}
            </LandingPinBeat>
            <LandingPinBeat
                testId="landing-receiver"
                label="Open time"
                caption="Accepted work blocks time on their calendar."
                spans={2.05}
                tone="calm"
            >
                {(progress) => <ReceiverFrame progress={progress} />}
            </LandingPinBeat>
            <LandingPinBeat
                testId="landing-overload"
                label="Plan"
                caption="If they are packed, it finds a slot."
                spans={2.05}
                tone="calm"
            >
                {(progress) => <OverloadFrame progress={progress} />}
            </LandingPinBeat>
            <LandingPinBeat
                testId="landing-group"
                label="Group"
                caption="You see who actually did it."
                spans={1.9}
                tone="calm"
            >
                {(progress) => <GroupFrame progress={progress} />}
            </LandingPinBeat>
        </>
    );
}

function AssignerFrame({ progress }) {
    return (
        <article className="landing-peace-dash" data-testid="landing-solve-assigner">
            <header className="landing-peace-dash-head">
                <LandingCastMark who="maya" />
                <span className="landing-story-task-title">{TASK.title}</span>
            </header>
            <p className="landing-peace-line" data-testid="landing-peace-line">Assigned. Tracked. Done.</p>
            <ol className="landing-peace-steps">
                {STEPS.map((label, i) => (
                    <PeaceStep key={label} label={label} index={i} progress={progress} />
                ))}
            </ol>
        </article>
    );
}

function PeaceStep({ label, index, progress }) {
    const at = 0.22 + index * 0.22;
    const on = useTransform(progress, [at, at + 0.14], [0, 1]);
    const scale = useTransform(on, [0, 1], [0.6, 1]);
    const textOp = useTransform(on, (v) => 0.35 + v * 0.65);
    return (
        <li className="landing-peace-step">
            <motion.span className="landing-peace-dot" style={{ opacity: on, scale }} />
            <motion.span style={{ opacity: textOp }}>{label}</motion.span>
        </li>
    );
}

function ReceiverFrame({ progress }) {
    const slotX = useTransform(progress, [0.2, 0.55], [-120, 0]);
    const slotOp = useTransform(progress, [0.2, 0.42], [0, 1]);
    const glow = useTransform(progress, [0.45, 0.75], [0.18, 0.55]);
    const chipShadow = useTransform(glow, (v) => `0 0 28px rgba(45,212,191,${v})`);

    return (
        <div className="landing-cal-wrap" data-testid="landing-solve-calendar">
            <div className="landing-week">
                {WEEK.map((day) => (
                    <div key={day.d} className={`landing-week-day${day.open ? ' is-open' : ''}`}>
                        <span>{day.d}</span>
                        {day.busy.map((busy, i) => (
                            <span key={`${day.d}-${i}`} className={`landing-cal-slot${busy ? ' is-busy' : ' is-due'}`} />
                        ))}
                    </div>
                ))}
            </div>
            <motion.div
                className="landing-cal-chip"
                style={{ x: slotX, opacity: slotOp, boxShadow: chipShadow }}
            >
                <LandingCastMark who="maya" size="sm" />
                <span>{TASK.title}</span>
            </motion.div>
        </div>
    );
}

function OverloadFrame({ progress }) {
    const chatOp = useTransform(progress, [0.32, 0.5], [0, 1]);
    const replyOp = useTransform(progress, [0.58, 0.74], [0, 1]);
    const chatY = useTransform(chatOp, [0, 1], [12, 0]);
    const replyY = useTransform(replyOp, [0, 1], [12, 0]);

    return (
        <div className="landing-overload" data-testid="landing-solve-conflict">
            <div className="landing-week landing-week--packed">
                {WEEK.map((day) => (
                    <div key={day.d} className="landing-week-day">
                        <span>{day.d}</span>
                        <span className="landing-cal-slot is-busy" />
                        <span className="landing-cal-slot is-busy" />
                    </div>
                ))}
            </div>
            <div className="landing-ai-thread">
                <motion.div className="landing-ai-bubble" style={{ opacity: chatOp, y: chatY }}>
                    <JarvisIcon size={22} />
                    <p>Packed. Thursday?</p>
                </motion.div>
                <motion.div className="landing-ai-reply" style={{ opacity: replyOp, y: replyY }}>
                    <LandingCastMark who="maya" size="sm" />
                    <p>Thursday.</p>
                </motion.div>
            </div>
        </div>
    );
}

function GroupFrame({ progress }) {
    return (
        <article className="landing-group-card" data-testid="landing-solve-group">
            <header className="landing-group-head">
                <span className="landing-story-task-title">Q3 forecast</span>
                <CompletionRing pct={GROUP_AVG} size={52} testId="landing-group-avg" />
            </header>
            <ol className="landing-lb landing-lb--avatars">
                {GROUP_BOARD.map((row, i) => (
                    <GroupRow key={row.who} row={row} index={i} progress={progress} />
                ))}
            </ol>
        </article>
    );
}

function GroupRow({ row, index, progress }) {
    const opacity = useTransform(progress, [0.2 + index * 0.12, 0.34 + index * 0.12], [0, 1]);
    return (
        <motion.li style={{ opacity }}>
            <span>{index + 1}</span>
            <LandingCastMark who={row.who} size="sm" />
            <span>{CAST[row.who].name}</span>
            <b>{row.pct}%</b>
        </motion.li>
    );
}
