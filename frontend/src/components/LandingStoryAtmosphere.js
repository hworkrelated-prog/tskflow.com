import React from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';

// Three acts, one mood each. Slow on purpose — the color is a backdrop,
// not a second animation competing with the story.
const STOPS = [0, 0.32, 0.68, 1];

const GLOW_A = [
    'rgba(45,212,191,0.16)',
    'rgba(45,212,191,0.14)',
    'rgba(217,119,6,0.12)',
    'rgba(20,184,166,0.16)',
];

const GLOW_B = [
    'rgba(15,118,110,0.12)',
    'rgba(15,118,110,0.10)',
    'rgba(180,83,9,0.10)',
    'rgba(15,118,110,0.12)',
];

const BAR_COLOR = [
    '#2dd4bf',
    '#5eead4',
    '#d97706',
    '#14b8a6',
];

/**
 * Fixed, page-level layer for the "story" tab only: a thin reading-progress
 * bar, plus two huge blurred blobs whose color drifts through the three
 * acts (meeting → chase → TskFlow) as you scroll.
 */
export default function LandingStoryAtmosphere({ targetRef }) {
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({
        target: targetRef,
        offset: ['start start', 'end end'],
    });

    const barProgress = useSpring(scrollYProgress, { stiffness: 180, damping: 42, mass: 0.6 });
    const moodProgress = useSpring(scrollYProgress, { stiffness: 28, damping: 22, mass: 0.7 });

    const barColor = useTransform(moodProgress, STOPS, BAR_COLOR);
    const glowA = useTransform(moodProgress, STOPS, GLOW_A);
    const glowB = useTransform(moodProgress, STOPS, GLOW_B);

    return (
        <>
            <div className="landing-story-atmosphere" aria-hidden="true" data-testid="landing-story-atmosphere">
                <motion.span
                    className="landing-story-glow landing-story-glow--a"
                    style={reduce ? undefined : { background: glowA }}
                />
                <motion.span
                    className="landing-story-glow landing-story-glow--b"
                    style={reduce ? undefined : { background: glowB }}
                />
            </div>
            <div className="landing-story-progress" aria-hidden="true" data-testid="landing-story-progress">
                <motion.div
                    className="landing-story-progress-fill"
                    style={{
                        scaleX: reduce ? scrollYProgress : barProgress,
                        background: reduce ? undefined : barColor,
                    }}
                />
            </div>
        </>
    );
}
