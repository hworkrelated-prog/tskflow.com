import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

const STACK = [
    { id: 'a', title: 'Forecast', who: 'Maya', tone: 'teal' },
    { id: 'b', title: 'Call log', who: 'Maya', tone: 'amber' },
    { id: 'c', title: 'Deck', who: 'Maya', tone: 'sky' },
    { id: 'd', title: 'SFDC', who: 'Maya', tone: 'rose' },
];

/** First task, then another, then another. */
export default function LandingPileUp() {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ['start 0.85', 'center 0.35'],
    });

    return (
        <section
            ref={ref}
            className="landing-story landing-story--scrub"
            data-testid="landing-pile"
            aria-label="Then another"
        >
            <div className="landing-pile-stage">
                {STACK.map((card, i) => (
                    <PileCard
                        key={card.id}
                        card={card}
                        index={i}
                        progress={scrollYProgress}
                        reduce={reduce}
                    />
                ))}
            </div>
        </section>
    );
}

const PileCard = ({ card, index, progress, reduce }) => {
    const start = 0.08 + index * 0.18;
    const y = useTransform(progress, [start, start + 0.28], [90 + index * 18, index * 18]);
    const opacity = useTransform(progress, [start, start + 0.16], [0, 1]);
    const rotate = useTransform(progress, [start, start + 0.28], [8 - index * 2, index * 1.4 - 2]);

    return (
        <motion.article
            className={`landing-pile-card landing-pile-card--${card.tone}`}
            style={reduce ? { top: index * 18 } : { y, opacity, rotate }}
            data-testid={`landing-pile-${card.id}`}
        >
            <span className="landing-nametag landing-nametag--sm">{card.who}</span>
            <span className="landing-mini-title">{card.title}</span>
        </motion.article>
    );
};
