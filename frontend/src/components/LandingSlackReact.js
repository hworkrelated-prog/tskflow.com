import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const ease = [0.22, 1, 0.36, 1];

const REACTIONS = [
    { id: 'up', mark: '👍', n: 4 },
    { id: 'ok', mark: '✅', n: 3 },
    { id: 'eyes', mark: '👀', n: 5 },
];

/** Slack post. Emoji ack. Screenshot sits like Slack. */
export default function LandingSlackReact() {
    const reduce = useReducedMotion();

    return (
        <section
            className="landing-story landing-story--scrub"
            data-testid="landing-slack"
            aria-label="Slack"
        >
            <article className="landing-slack" data-testid="landing-slack-post">
                <div className="landing-slack-head">
                    <span className="landing-meet-avatar landing-meet-avatar--sm">H</span>
                    <span className="landing-slack-name">Hashim</span>
                    <span className="landing-slack-time">2:14</span>
                </div>
                <p className="landing-slack-body">Forecast. Friday.</p>
                <div className="slack-mosaic slack-mosaic--2 landing-slack-mosaic" data-testid="landing-slack-images">
                    <span className="slack-tile landing-shot landing-shot--pipe" />
                    <span className="slack-tile landing-shot landing-shot--crm" />
                </div>
                <div className="landing-slack-rx" data-testid="landing-slack-reactions">
                    {REACTIONS.map((rx, i) => (
                        <motion.span
                            key={rx.id}
                            className="landing-slack-chip"
                            initial={reduce ? false : { scale: 0.6, opacity: 0, y: 8 }}
                            whileInView={reduce ? undefined : { scale: 1, opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.8 }}
                            transition={{ delay: 0.35 + i * 0.12, type: 'spring', stiffness: 420, damping: 16 }}
                        >
                            {rx.mark} {rx.n}
                        </motion.span>
                    ))}
                </div>
            </article>
        </section>
    );
}
