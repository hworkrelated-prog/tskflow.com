import React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

/**
 * Instagram / Apple product-page motion: a sticky viewport is scrubbed by
 * scroll, not by a looping CSS animation. Chaos (Slack pings, stray asks)
 * collapses into one owned ask as the user moves through the three steps.
 */
const CHIPS = [
    { id: 'c1', label: 'can you take this?', slack: true, x: [-28, 8, 42], y: [18, 8, 62], r: [-8, 4, 0], s: [0.92, 1, 0.72] },
    { id: 'c2', label: 'where did this go?', slack: true, x: [72, 58, 48], y: [12, 22, 64], r: [10, -6, 0], s: [0.86, 1, 0.7] },
    { id: 'c3', label: 'ping · no reply', slack: false, x: [8, 18, 44], y: [78, 54, 66], r: [6, -3, 0], s: [0.9, 1, 0.68] },
    { id: 'c4', label: 'who owns this?', slack: false, x: [82, 70, 50], y: [70, 48, 66], r: [-12, 5, 0], s: [0.88, 0.98, 0.7] },
    { id: 'c5', label: 'following up again', slack: true, x: [40, 22, 46], y: [4, 16, 63], r: [4, -8, 0], s: [0.8, 1, 0.66] },
    { id: 'c6', label: 'still waiting', slack: false, x: [55, 78, 52], y: [86, 72, 67], r: [-4, 8, 0], s: [0.85, 1, 0.68] },
    { id: 'c7', label: '@here ??', slack: true, x: [-6, 4, 40], y: [48, 36, 64], r: [14, 2, 0], s: [0.78, 0.96, 0.64] },
    { id: 'c8', label: 'missed in the thread', slack: false, x: [96, 86, 54], y: [38, 30, 65], r: [-9, -2, 0], s: [0.82, 1, 0.66] },
];

const Chip = ({ chip, progress }) => {
    const x = useTransform(progress, [0, 0.45, 1], [`${chip.x[0]}vw`, `${chip.x[1]}vw`, `${chip.x[2]}vw`]);
    const y = useTransform(progress, [0, 0.45, 1], [`${chip.y[0]}vh`, `${chip.y[1]}vh`, `${chip.y[2]}vh`]);
    const rotate = useTransform(progress, [0, 0.45, 1], chip.r);
    const scale = useTransform(progress, [0, 0.45, 1], chip.s);
    const opacity = useTransform(progress, [0, 0.12, 0.72, 1], [0.15, 0.9, 0.55, 0.08]);

    return (
        <motion.div
            className={`landing-chaos-chip ${chip.slack ? 'landing-chaos-chip--slack' : ''}`}
            style={{ x, y, rotate, scale, opacity }}
        >
            {chip.slack && <span className="landing-chaos-hash" aria-hidden>#</span>}
            {chip.label}
        </motion.div>
    );
};

const CatchHand = ({ progress, side }) => {
    const fromX = side === 'left' ? -12 : 108;
    const midX = side === 'left' ? 18 : 78;
    const toX = side === 'left' ? 38 : 58;
    const x = useTransform(progress, [0, 0.4, 1], [`${fromX}vw`, `${midX}vw`, `${toX}vw`]);
    const y = useTransform(progress, [0, 0.4, 1], ['72vh', '58vh', '70vh']);
    const opacity = useTransform(progress, [0, 0.2, 0.62, 0.85], [0, 0.55, 0.28, 0]);
    const rotate = useTransform(progress, [0, 0.4, 1], side === 'left' ? [20, -8, 0] : [-20, 10, 0]);

    return (
        <motion.div className={`landing-chaos-hand landing-chaos-hand--${side}`} style={{ x, y, opacity, rotate }} aria-hidden>
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <path
                    d="M18 32c0-6 3-10 7-10 2 0 3 1 4 3V16c0-3 2-5 5-5s5 2 5 5v7c1-2 3-3 5-3 3 0 5 3 5 6v13c0 7-6 12-13 12h-3c-8 0-15-6-15-14v-6z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                />
            </svg>
        </motion.div>
    );
};

const LandingScrollChaos = () => {
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll();
    const lineScale = useTransform(scrollYProgress, [0, 1], [0.08, 1]);
    const captionA = useTransform(scrollYProgress, [0, 0.28, 0.42], [0.85, 0.55, 0]);
    const captionB = useTransform(scrollYProgress, [0.32, 0.5, 0.72], [0, 0.85, 0]);
    const captionC = useTransform(scrollYProgress, [0.62, 0.82, 1], [0, 0.8, 0.35]);
    const gatherGlow = useTransform(scrollYProgress, [0.55, 0.9], [0, 0.55]);

    if (reduce) {
        return (
            <div className="landing-chaos landing-chaos--still" aria-hidden data-testid="landing-scroll-chaos">
                <div className="landing-chaos-lane" />
            </div>
        );
    }

    return (
        <div className="landing-chaos" aria-hidden data-testid="landing-scroll-chaos">
            <motion.div className="landing-chaos-lane" style={{ scaleY: lineScale }} />
            <motion.div className="landing-chaos-gather" style={{ opacity: gatherGlow }} />
            {CHIPS.map((chip) => (
                <Chip key={chip.id} chip={chip} progress={scrollYProgress} />
            ))}
            <CatchHand progress={scrollYProgress} side="left" />
            <CatchHand progress={scrollYProgress} side="right" />
            <motion.p className="landing-chaos-caption landing-chaos-caption--a" style={{ opacity: captionA }}>
                Asks bounce around Slack.
            </motion.p>
            <motion.p className="landing-chaos-caption landing-chaos-caption--b" style={{ opacity: captionB }}>
                People keep missing them.
            </motion.p>
            <motion.p className="landing-chaos-caption landing-chaos-caption--c" style={{ opacity: captionC }}>
                One ask. Followed through.
            </motion.p>
        </div>
    );
};

export default LandingScrollChaos;
