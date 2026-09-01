import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import LandingFace from '@/components/LandingFace';
import { CAST } from '@/lib/landingCast';
import AccountabilityScore from '@/components/AccountabilityScore';

const CHASE = [
    'Did you get this?',
    'Any update?',
    'Just checking...',
    'Is this done?',
    'Can you send me that?',
    "What's the status?",
    'Did you remember?',
];

const FILE_STEPS = [
    'Record the 1:1',
    'Screenshot Slack',
    'Write it up yourself',
    'Hope HR can use it',
];

const PERF = [
    { who: 'priya', score: 94, label: 'Strong', done: 12, assigned: 12 },
    { who: 'chris', score: 71, label: 'Solid', done: 9, assigned: 12 },
    { who: 'maya', score: 41, label: 'At risk', done: 4, assigned: 10 },
    { who: 'jordan', score: 18, label: 'Needs work', done: 2, assigned: 11 },
];

export default function LandingBeforeAfter() {
    const reduce = useReducedMotion();
    const [side, setSide] = useState('without');
    const [held, setHeld] = useState(false);
    const [shown, setShown] = useState(reduce ? CHASE.length : 1);

    useEffect(() => {
        if (reduce || held) return undefined;
        if (side === 'without' && shown < CHASE.length) {
            const id = window.setTimeout(() => setShown((n) => n + 1), 520);
            return () => window.clearTimeout(id);
        }
        if (side === 'without' && shown >= CHASE.length) {
            const id = window.setTimeout(() => {
                setSide('with');
            }, 1400);
            return () => window.clearTimeout(id);
        }
        const id = window.setTimeout(() => {
            setSide('without');
            setShown(1);
        }, 5200);
        return () => window.clearTimeout(id);
    }, [held, reduce, shown, side]);

    const pick = (next) => {
        setHeld(true);
        setSide(next);
        if (next === 'without') setShown(CHASE.length);
    };

    return (
        <section className="landing-compare" data-testid="landing-compare" id="landing-compare">
            <p className="landing-section-kicker">Before / after</p>
            <div className="landing-compare-tabs" data-testid="landing-compare-tabs">
                <button
                    type="button"
                    className={side === 'without' ? 'is-on' : ''}
                    onClick={() => pick('without')}
                    data-testid="landing-compare-without-btn"
                >
                    Without TskFlow
                </button>
                <button
                    type="button"
                    className={side === 'with' ? 'is-on' : ''}
                    onClick={() => pick('with')}
                    data-testid="landing-compare-with-btn"
                >
                    With TskFlow
                </button>
            </div>
            <AnimatePresence mode="wait">
                {side === 'without' ? (
                    <motion.div
                        key="without"
                        className="landing-compare-pane"
                        data-testid="landing-compare-without"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.35 }}
                    >
                        <p className="landing-compare-label">No paper trail</p>
                        <p className="landing-compare-lead" data-testid="landing-compare-without-lead">
                            There is no clear way to hold people accountable.
                        </p>
                        <ul className="landing-chase-list">
                            {CHASE.slice(0, shown).map((line, i) => (
                                <li key={line} style={{ opacity: 0.42 + (i / CHASE.length) * 0.58 }}>
                                    <LandingFace who="alex" size={28} radius={8} />
                                    {line}
                                </li>
                            ))}
                        </ul>
                        <div className="landing-hr-file" data-testid="landing-compare-file">
                            <p className="landing-compare-label">If someone is a problem</p>
                            <p className="landing-compare-file-lead">
                                You start documenting. Record meetings. Pull Slack. Build a file.
                            </p>
                            <ul>
                                {FILE_STEPS.map((step) => (
                                    <li key={step}>{step}</li>
                                ))}
                            </ul>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="with"
                        className="landing-compare-pane landing-compare-pane--calm"
                        data-testid="landing-compare-with"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.35 }}
                    >
                        <p className="landing-compare-label">Team performance</p>
                        <p className="landing-compare-lead">
                            The same view leaders and HR already use after sign in.
                        </p>
                        <ul className="landing-perf-list" data-testid="landing-compare-perf">
                            {PERF.map((row) => {
                                const person = CAST[row.who];
                                return (
                                    <li key={row.who} data-testid={`landing-perf-${row.who}`}>
                                        <LandingFace who={row.who} size={32} radius={999} />
                                        <span className="landing-perf-who">
                                            <b>{person.name}</b>
                                            <span>{row.done}/{row.assigned} done</span>
                                        </span>
                                        <AccountabilityScore
                                            score={row.score}
                                            label={row.label}
                                            size="sm"
                                            testId={`landing-perf-score-${row.who}`}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="landing-compare-calm" data-testid="landing-compare-calm">
                            Leaders see who follows through. HR already has the record.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
