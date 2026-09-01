import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import LandingCastMark from '@/components/LandingCastMark';

const CHASE = [
    'Did you get this?',
    'Any update?',
    'Just checking...',
    'Is this done?',
    'Can you send me that?',
    "What's the status?",
    'Did you remember?',
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
            }, 1100);
            return () => window.clearTimeout(id);
        }
        const id = window.setTimeout(() => {
            setSide('without');
            setShown(1);
        }, 4200);
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
                        <p className="landing-compare-label">Manager</p>
                        <ul className="landing-chase-list">
                            {CHASE.slice(0, shown).map((line, i) => (
                                <li key={line} style={{ opacity: 0.42 + (i / CHASE.length) * 0.58 }}>
                                    <LandingCastMark who="hashim" size="sm" />
                                    {line}
                                </li>
                            ))}
                        </ul>
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
                        <p className="landing-compare-label">Manager dashboard</p>
                        <ul className="landing-board-nums">
                            <li><b>12</b> commitments</li>
                            <li><b>9</b> completed</li>
                            <li><b>2</b> in progress</li>
                            <li className="is-risk"><b>1</b> at risk</li>
                        </ul>
                        <p className="landing-compare-calm" data-testid="landing-compare-calm">
                            No chasing. No Slack archaeology. No guessing.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
