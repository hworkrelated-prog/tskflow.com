import React, { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll } from 'framer-motion';

/**
 * Tall section with a sticky viewport. Animation scrubs with scroll.
 * Reduced motion: one screen, end state (progress = 1).
 */
export default function LandingPinBeat({
    testId,
    label,
    spans = 2.15,
    tone,
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

    return (
        <section
            ref={ref}
            className={`landing-pin${tone ? ` landing-pin--${tone}` : ''}`}
            style={{ height: reduce ? '100svh' : `${spans * 100}svh` }}
            data-testid={testId}
            aria-label={label}
        >
            <div className="landing-pin-frame">
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
