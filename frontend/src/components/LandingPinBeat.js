import React, { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll } from 'framer-motion';

/**
 * Tall section with a sticky viewport. Animation scrubs with scroll.
 * Reduced motion: one screen, end state (progress = 1).
 *
 * The frame stays fully visible for the whole pin. Fading / blurring the
 * sticky stage made the story look drunk and unreadable; chapter kickers
 * are the handoff, not a visual dissolve.
 */
export default function LandingPinBeat({
    testId,
    label,
    caption,
    spans = 2.15,
    tone,
    step,
    totalSteps = 3,
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
            <div className="landing-pin-frame">
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
            </div>
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
