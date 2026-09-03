import React from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';

// Rough cumulative position (0-1) of each act across the whole story scroll,
// derived from the beats' relative `spans`. Doesn't need to be pixel-perfect -
// this only drives an ambient mood cue, not a navigation aid, so "close enough"
// keeps the color arc roughly synced with what's on screen:
// calm ask -> neutral grind -> warm frustration -> bright turn -> calm fix.
const STOPS = [0, 0.05, 0.22, 0.34, 0.46, 0.55, 0.64, 0.78, 1];

const GLOW_A = [
    'rgba(45,212,191,0.20)', // hero: curious, calm teal
    'rgba(45,212,191,0.16)', // the ask
    'rgba(100,116,139,0.16)', // the week grinds on: neutral slate
    'rgba(217,119,6,0.16)', // pile-up: warming
    'rgba(220,38,38,0.18)', // the chase: hot, tense
    'rgba(234,88,12,0.17)', // fake done: still stinging
    'rgba(45,212,191,0.34)', // the turn: bright relief flash
    'rgba(20,184,166,0.18)', // the fix: settling calm
    'rgba(13,148,136,0.16)', // proof: resolved
];

const GLOW_B = [
    'rgba(15,118,110,0.16)',
    'rgba(15,118,110,0.14)',
    'rgba(71,85,105,0.14)',
    'rgba(180,83,9,0.14)',
    'rgba(190,18,60,0.15)',
    'rgba(194,65,12,0.14)',
    'rgba(94,234,212,0.24)',
    'rgba(15,118,110,0.16)',
    'rgba(15,118,110,0.14)',
];

const BAR_COLOR = [
    '#2dd4bf',
    '#5eead4',
    '#64748b',
    '#d97706',
    '#dc2626',
    '#ea580c',
    '#2dd4bf',
    '#14b8a6',
    '#0d9488',
];

/**
 * Fixed, page-level layer for the "story" tab only: a thin reading-progress
 * bar pinned above everything, plus two huge blurred blobs whose color drifts
 * through the arc of the story (calm -> tense -> relief -> calm) as you
 * scroll. Both are driven by one scroll read of the whole story track so this
 * stays cheap - no per-beat re-renders, just motion-value transforms.
 */
export default function LandingStoryAtmosphere({ targetRef }) {
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll({
        target: targetRef,
        offset: ['start start', 'end end'],
    });

    const barProgress = useSpring(scrollYProgress, { stiffness: 280, damping: 40, mass: 0.4 });
    const moodProgress = useSpring(scrollYProgress, { stiffness: 45, damping: 20, mass: 0.5 });

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
                        // Reduced motion still moves through a real (shorter) scroll -
                        // keep the bar honest by reading raw position, just without the
                        // spring lag or the shifting color, which are the "motion" parts.
                        scaleX: reduce ? scrollYProgress : barProgress,
                        background: reduce ? undefined : barColor,
                    }}
                />
            </div>
        </>
    );
}
