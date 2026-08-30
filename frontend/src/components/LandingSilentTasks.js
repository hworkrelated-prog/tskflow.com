import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

const TASKS = [
    { id: 't1', who: 'Maya', title: 'Forecast', silent: true, due: 'Friday' },
    { id: 't2', who: 'Chris', title: 'Q3 recap', silent: true },
    { id: 't3', who: 'Priya', title: 'Discovery', silent: false },
    { id: 't4', who: 'Jordan', title: 'SFDC', silent: true },
    { id: 't5', who: 'Alex', title: 'Call log', silent: true },
    { id: 't6', who: 'Sam', title: 'Deck', silent: true },
];

/**
 * Most assigned cards grey out and stop. One keeps pulsing.
 * That is the manager problem: silence until it is too late.
 */
export default function LandingSilentTasks() {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ['start 0.82', 'center 0.38'],
    });
    const fade = useTransform(scrollYProgress, [0.12, 0.9], [0, 1]);

    return (
        <section
            ref={ref}
            className="landing-story landing-story--scrub"
            data-testid="landing-silent-tasks"
            aria-label="Gone quiet"
        >
            <p className="landing-story-kicker">Gone quiet.</p>
            <div className="landing-silent-grid">
                {TASKS.map((task, i) => (
                    <SilentCard
                        key={task.id}
                        task={task}
                        index={i}
                        fade={fade}
                        reduce={reduce}
                    />
                ))}
            </div>
        </section>
    );
}

const SilentCard = ({ task, index, fade, reduce }) => {
    const opacity = useTransform(fade, (v) => (task.silent ? 1 - v * 0.74 : 1));
    const scale = useTransform(fade, (v) => (task.silent ? 1 - v * 0.05 : 1));
    const filter = useTransform(fade, (v) => (task.silent ? `grayscale(${v})` : 'grayscale(0)'));

    return (
        <motion.article
            className={`landing-mini-card ${task.silent ? 'is-silent' : 'is-live'}${reduce && task.silent ? ' is-silent-end' : ''}`}
            style={reduce ? undefined : { opacity, scale, filter }}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.45 }}
            transition={{ duration: 0.45, delay: index * 0.055, ease: [0.22, 1, 0.36, 1] }}
            data-testid={task.silent ? 'landing-silent-card' : 'landing-live-card'}
        >
            <span className="landing-nametag landing-nametag--sm">{task.who}</span>
            <span className="landing-mini-title">{task.title}</span>
            {task.due ? (
                <span className="landing-clockchip landing-clockchip--sm is-overdue" data-testid="landing-due-miss">
                    {task.due}
                </span>
            ) : null}
            {!task.silent ? <span className="landing-live-dot" aria-hidden /> : null}
        </motion.article>
    );
};
