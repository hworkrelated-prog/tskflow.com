import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import CompletionRing from '@/components/CompletionRing';

const ease = [0.22, 1, 0.36, 1];

const BOARD = [
    { name: 'Priya', pct: 100 },
    { name: 'Chris', pct: 72 },
    { name: 'Maya', pct: 40 },
    { name: 'Jordan', pct: 18 },
];

const SLOTS = [
    { t: '10:00', busy: true },
    { t: '11:30', busy: true },
    { t: '2:00', busy: false, due: true },
    { t: '4:00', busy: true },
];

/** TskFlow. Assigner watches. Calendar lands the due. Conflicts get a plan. Group races. */
export default function LandingSolve() {
    const reduce = useReducedMotion();
    const avg = Math.round(BOARD.reduce((s, r) => s + r.pct, 0) / BOARD.length);

    return (
        <section className="landing-story" data-testid="landing-solve" aria-label="TskFlow">
            <p className="landing-story-kicker">TskFlow</p>
            <div className="landing-solve-grid">
                <motion.article
                    className="landing-solve-card"
                    data-testid="landing-solve-assigner"
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.45 }}
                    transition={{ duration: 0.45, ease }}
                >
                    <span className="landing-nametag">You</span>
                    <span className="landing-mini-title">Assigned</span>
                    <span className="landing-live-dot" aria-hidden />
                </motion.article>

                <motion.article
                    className="landing-solve-card landing-cal"
                    data-testid="landing-solve-calendar"
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.45 }}
                    transition={{ duration: 0.45, delay: 0.08, ease }}
                >
                    {SLOTS.map((s) => (
                        <span
                            key={s.t}
                            className={`landing-cal-slot${s.busy ? ' is-busy' : ''}${s.due ? ' is-due' : ''}`}
                        >
                            {s.t}
                        </span>
                    ))}
                </motion.article>

                <motion.article
                    className="landing-solve-card landing-solve-chat"
                    data-testid="landing-solve-conflict"
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.45 }}
                    transition={{ duration: 0.45, delay: 0.16, ease }}
                >
                    <p className="landing-chat-them">Stacked. Thursday?</p>
                    <p className="landing-chat-me">Thursday.</p>
                </motion.article>

                <motion.article
                    className="landing-solve-card landing-solve-board"
                    data-testid="landing-solve-group"
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.45 }}
                    transition={{ duration: 0.45, delay: 0.24, ease }}
                >
                    <div className="landing-solve-avg">
                        <CompletionRing pct={avg} size={52} testId="landing-group-avg" />
                    </div>
                    <ol className="landing-lb">
                        {BOARD.map((row, i) => (
                            <li key={row.name}>
                                <span>{i + 1}</span>
                                <span>{row.name}</span>
                                <b>{row.pct}%</b>
                            </li>
                        ))}
                    </ol>
                </motion.article>
            </div>
        </section>
    );
}
