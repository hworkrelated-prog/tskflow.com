import React from 'react';
import { motion, useTransform } from 'framer-motion';
import LandingPinBeat from '@/components/LandingPinBeat';
import LandingCastMark from '@/components/LandingCastMark';

const DAYS = [
    { id: 'mon', label: 'Monday', line: 'Meeting. "Yes, I\'ll handle it."', at: 0 },
    { id: 'tue', label: 'Tuesday', line: 'Slack explodes.', at: 0.18 },
    { id: 'wed', label: 'Wednesday', line: 'More meetings. More priorities.', at: 0.38 },
    { id: 'thu', label: 'Thursday', line: 'Was that actually done?', at: 0.58 },
    { id: 'fri', label: 'Friday', line: 'Oh shit. I forgot.', at: 0.76 },
];

const BURY = [
    { id: 'b1', at: 0.2, who: 'chris', text: 'Quick question...' },
    { id: 'b2', at: 0.26, who: 'priya', text: 'Can you also...' },
    { id: 'b3', at: 0.32, who: 'jordan', text: 'Need this by EOD.' },
    { id: 'b4', at: 0.42, who: 'chris', text: 'Can you jump on this call?' },
    { id: 'b5', at: 0.48, who: 'priya', text: 'New deck for the QBR.' },
    { id: 'b6', at: 0.54, who: 'jordan', text: 'Moving the 1:1.' },
];

export default function LandingWeek() {
    return (
        <LandingPinBeat
            testId="landing-week"
            label="The week"
            caption="Watch the yes disappear."
            spans={2.8}
        >
            {(progress) => <WeekFrame progress={progress} />}
        </LandingPinBeat>
    );
}

function WeekFrame({ progress }) {
    const bury = useTransform(progress, [0.18, 0.72], [0, 1]);
    const commitOp = useTransform(bury, (v) => 1 - v * 0.72);
    const commitY = useTransform(bury, (v) => v * 28);
    const commitScale = useTransform(bury, (v) => 1 - v * 0.08);
    const thuOp = useTransform(progress, [0.58, 0.7], [0, 1]);
    const friAsk = useTransform(progress, [0.76, 0.86], [0, 1]);
    const friReply = useTransform(progress, [0.86, 0.96], [0, 1]);

    return (
        <div className="landing-week-story" data-testid="landing-week-frame">
            <ol className="landing-week-rail" data-testid="landing-week-days">
                {DAYS.map((day, i) => (
                    <DayMark key={day.id} day={day} index={i} progress={progress} />
                ))}
            </ol>
            <div className="landing-week-stage">
                <motion.article
                    className="landing-commit-card"
                    style={{ opacity: commitOp, y: commitY, scale: commitScale }}
                    data-testid="landing-week-commit"
                >
                    <LandingCastMark who="maya" size="sm" />
                    <div>
                        <p>Send the Q3 forecast</p>
                        <span>Yes. Friday.</span>
                    </div>
                </motion.article>
                <div className="landing-week-bury" data-testid="landing-week-bury">
                    {BURY.map((item, i) => (
                        <BuryCard key={item.id} item={item} index={i} progress={progress} />
                    ))}
                </div>
                <motion.p className="landing-week-thought" style={{ opacity: thuOp }} data-testid="landing-week-thursday">
                    Was that actually done?
                </motion.p>
                <div className="landing-week-friday">
                    <motion.p className="landing-week-msg is-you" style={{ opacity: friAsk }} data-testid="landing-week-friday-ask">
                        <LandingCastMark who="hashim" size="sm" />
                        <span>Hey, any update on this?</span>
                    </motion.p>
                    <motion.p className="landing-week-msg" style={{ opacity: friReply }} data-testid="landing-week-friday-reply">
                        <LandingCastMark who="maya" size="sm" />
                        <span>Oh shit. I forgot.</span>
                    </motion.p>
                </div>
            </div>
        </div>
    );
}

function DayMark({ day, index, progress }) {
    const next = DAYS[index + 1]?.at ?? 1;
    const on = useTransform(progress, [day.at, day.at + 0.04, next], [0.35, 1, 1]);
    const live = useTransform(progress, (v) => {
        if (index === DAYS.length - 1) return v >= day.at ? 1 : 0;
        return v >= day.at && v < next ? 1 : 0;
    });
    return (
        <motion.li style={{ opacity: on }} data-testid={`landing-week-${day.id}`}>
            <motion.span className="landing-week-dot" style={{ opacity: live }} />
            <b>{day.label}</b>
            <span>{day.line}</span>
        </motion.li>
    );
}

function BuryCard({ item, index, progress }) {
    const opacity = useTransform(progress, [item.at, item.at + 0.08], [0, 1]);
    const y = useTransform(progress, [item.at, item.at + 0.1], [-18, index * 10]);
    const x = useTransform(progress, [item.at, item.at + 0.1], [8, index % 2 === 0 ? -6 : 10]);
    const rotate = useTransform(progress, [item.at, item.at + 0.1], [4, index % 2 === 0 ? -2.5 : 3]);
    return (
        <motion.p
            className="landing-bury-card"
            style={{ opacity, y, x, rotate, zIndex: index + 2 }}
            data-testid={`landing-week-bury-${item.id}`}
        >
            <LandingCastMark who={item.who} size="sm" />
            <span>{item.text}</span>
        </motion.p>
    );
}
