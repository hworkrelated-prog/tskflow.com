import React, { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';

const TOTAL_STORY_STEPS = 8;

/**
 * Tall section with a sticky viewport. Animation scrubs with scroll.
 * Reduced motion: one screen, end state (progress = 1).
 *
 * The frame itself now arrives and resolves at the edges of its own scroll
 * range (fade + soften + a hair of scale) instead of hard-cutting to the next
 * beat - that handoff was the biggest source of the "transitions feel
 * minimal" feedback. Content choreography inside each beat is untouched.
 */
export default function LandingPinBeat({
    testId,
    label,
    caption,
    spans = 2.15,
    tone,
    step,
    totalSteps = TOTAL_STORY_STEPS,
    children,
}) {
    const ref = useRef(null);
    const reduce = useReducedMotion();
    const done = useMotionValue(1);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ['start start', 'end end'],
    });
    const progress = reduce ? done : scrollYProgress;
    const spoken = caption || label;

    // 0 -> 1 -> 1 -> 0 across the beat: invisible for an instant at both edges,
    // full strength through the middle. Springing it (rather than the content
    // progress above) keeps every existing beat's internal timing untouched.
    const edge = useTransform(scrollYProgress, [0, 0.09, 0.91, 1], [0, 1, 1, 0]);
    const edgeSmooth = useSpring(edge, { stiffness: 300, damping: 40, mass: 0.5 });
    const frameOpacity = useTransform(edgeSmooth, (v) => (reduce ? 1 : 0.1 + v * 0.9));
    const frameScale = useTransform(edgeSmooth, (v) => (reduce ? 1 : 0.965 + v * 0.035));
    const frameBlur = useTransform(edgeSmooth, (v) => (reduce ? 'blur(0px)' : `blur(${(1 - v) * 5}px)`));

    const showKicker = Boolean(step);
    const kickerLabel = label && label !== caption ? label : null;

    return (
        <section
            ref={ref}
            id={testId}
            className={`landing-pin${tone ? ` landing-pin--${tone}` : ''}`}
            style={{ height: reduce ? '100svh' : `${spans * 100}svh` }}
            data-testid={testId}
            aria-label={spoken}
        >
            <motion.div
                className="landing-pin-frame"
                style={{ opacity: frameOpacity, scale: frameScale, filter: frameBlur }}
            >
                {showKicker ? (
                    <div className="landing-pin-kicker" aria-hidden="true" data-testid={`${testId}-kicker`}>
                        <span className="landing-pin-kicker-dots">
                            {Array.from({ length: totalSteps }, (_, i) => (
                                <i
                                    key={i}
                                    className={
                                        i + 1 === step ? 'is-now' : i + 1 < step ? 'is-done' : ''
                                    }
                                />
                            ))}
                        </span>
                        <span className="landing-pin-kicker-text">
                            {String(step).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
                            {kickerLabel ? <b>{kickerLabel}</b> : null}
                        </span>
                    </div>
                ) : null}
                {caption ? (
                    <p className="landing-pin-caption" data-testid={`${testId}-caption`}>
                        {caption}
                    </p>
                ) : null}
                {typeof children === 'function' ? children(progress, reduce) : children}
            </motion.div>
        </section>
    );
}

export function BeatStage({ className = '', children, ...rest }) {
    return (
        <motion.div className={`landing-beat-stage ${className}`.trim()} {...rest}>
            {children}
        </motion.div>
    );
}
