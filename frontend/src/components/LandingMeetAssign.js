import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const ease = [0.22, 1, 0.36, 1];

const PEOPLE = [
    { id: 'maya', name: 'Maya', you: false, agree: '👍' },
    { id: 'chris', name: 'Chris', you: false, agree: '👍' },
    { id: 'priya', name: 'Priya', you: false, agree: '✅' },
    { id: 'you', name: 'You', you: true, agree: '' },
];

/** Manager assigns in a Meet. People agree. No paragraph. */
export default function LandingMeetAssign() {
    const reduce = useReducedMotion();

    return (
        <section
            className="landing-story landing-story--scrub"
            data-testid="landing-meet"
            aria-label="Meet"
        >
            <div className="landing-meet" data-testid="landing-meet-frame">
                <div className="landing-meet-top">
                    <span className="landing-meet-dot" aria-hidden />
                    <span>Meet</span>
                </div>
                <div className="landing-meet-grid">
                    {PEOPLE.map((p, i) => (
                        <motion.article
                            key={p.id}
                            className={`landing-meet-tile${p.you ? ' is-you' : ''}`}
                            data-testid={`landing-meet-tile-${p.id}`}
                            initial={reduce ? false : { opacity: 0, scale: 0.94 }}
                            whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
                            viewport={{ once: true, amount: 0.45 }}
                            transition={{ duration: 0.45, delay: i * 0.08, ease }}
                        >
                            <span className="landing-meet-avatar">{p.name.slice(0, 1)}</span>
                            <span className="landing-meet-name">{p.name}</span>
                            {p.agree ? (
                                <motion.span
                                    className="landing-meet-agree"
                                    aria-hidden
                                    initial={reduce ? false : { scale: 0, opacity: 0 }}
                                    whileInView={reduce ? undefined : { scale: 1, opacity: 1 }}
                                    viewport={{ once: true, amount: 0.6 }}
                                    transition={{ delay: 0.55 + i * 0.12, type: 'spring', stiffness: 380, damping: 18 }}
                                >
                                    {p.agree}
                                </motion.span>
                            ) : null}
                        </motion.article>
                    ))}
                </div>
                <motion.p
                    className="landing-meet-ask"
                    data-testid="landing-meet-ask"
                    initial={reduce ? false : { y: 10, opacity: 0 }}
                    whileInView={reduce ? undefined : { y: 0, opacity: 1 }}
                    viewport={{ once: true, amount: 0.8 }}
                    transition={{ duration: 0.4, delay: 0.2, ease }}
                >
                    Forecast. Friday.
                </motion.p>
            </div>
        </section>
    );
}
