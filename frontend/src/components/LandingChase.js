import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

const PINGS = [
    { id: 'p1', text: 'Forecast' },
    { id: 'p2', text: 'pipeline.png' },
    { id: 'p3', text: 'Friday' },
];

/** You become the reminder. They half-do it unless you make a scene. */
export default function LandingChase() {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ['start 0.88', 'center 0.32'],
    });
    const fill = useTransform(scrollYProgress, [0.15, 0.55], [0.22, 0.48]);
    const burst = useTransform(scrollYProgress, [0.62, 0.9], [0, 1]);
    const halfOpacity = useTransform(fill, (v) => 0.55 + v * 0.2);
    const barWidth = useTransform(fill, (v) => `${Math.round(v * 100)}%`);
    const dealScale = useTransform(burst, (v) => 0.92 + v * 0.08);

    return (
        <section
            ref={ref}
            className="landing-story landing-story--scrub"
            data-testid="landing-chase"
            aria-label="You chase"
        >
            <div className="landing-chase">
                <div className="landing-chase-col" data-testid="landing-chase-pings">
                    {PINGS.map((p, i) => (
                        <motion.div
                            key={p.id}
                            className="landing-chase-ping"
                            initial={reduce ? false : { x: -24, opacity: 0 }}
                            whileInView={reduce ? undefined : { x: 0, opacity: 1 }}
                            viewport={{ once: true, amount: 0.6 }}
                            transition={{ delay: i * 0.14, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {p.text}
                        </motion.div>
                    ))}
                </div>
                <div className="landing-chase-col">
                    <motion.div
                        className="landing-half"
                        data-testid="landing-half-done"
                        style={reduce ? undefined : { opacity: halfOpacity }}
                    >
                        <motion.span
                            className="landing-half-bar"
                            style={reduce ? { width: '48%' } : { width: barWidth }}
                        />
                    </motion.div>
                    <motion.div
                        className="landing-big-deal"
                        data-testid="landing-big-deal"
                        style={reduce ? undefined : { opacity: burst, scale: dealScale }}
                    >
                        <span className="landing-hero-check" aria-hidden />
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
