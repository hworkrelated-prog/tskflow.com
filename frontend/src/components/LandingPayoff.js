import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const QUESTIONS = [
    'Did you do this?',
    "What's the status?",
    'Any update?',
    'Did you remember?',
];

export default function LandingPayoff({ onTry, onHow }) {
    const reduce = useReducedMotion();
    const [know, setKnow] = useState(Boolean(reduce));

    useEffect(() => {
        if (reduce) return undefined;
        const id = window.setTimeout(() => setKnow(true), 1200);
        return () => window.clearTimeout(id);
    }, [reduce]);

    return (
        <section className="landing-payoff-hero" data-testid="landing-hero" id="landing-payoff">
            <h1 className="landing-payoff-title" data-testid="landing-payoff-title">
                Imagine not having to ask.
            </h1>
            <ul className="landing-payoff-qs" data-testid="landing-payoff-frame">
                {QUESTIONS.map((line, i) => (
                    <li key={line} data-testid={`landing-payoff-q-${i}`}>{line}</li>
                ))}
            </ul>
            <p
                className={`landing-payoff-know${know ? ' is-on' : ''}`}
                data-testid="landing-payoff-know"
            >
                You already know.
            </p>
            <p className="landing-payoff-after" data-testid="landing-payoff-after">
                You can finally manage the business instead of managing reminders.
            </p>
            <p className="sr-only" data-testid="landing-pain-line">
                Imagine not having to ask.
            </p>
            <p className="sr-only" data-testid="landing-point">
                Someone says yes. Then you spend the week asking if it got done.
            </p>
            <p className="sr-only" data-testid="landing-pain-more">
                Managers should not be the reminder system.
            </p>
            <div className="landing-hero-ctas landing-payoff-ctas">
                <button type="button" className="landing-cta landing-cta-glow" onClick={onTry} data-testid="landing-hero-cta">
                    Stop being the chase.
                </button>
                <button type="button" className="landing-cta-ghost" onClick={onHow} data-testid="landing-hero-how">
                    See how it works
                </button>
            </div>
            <ScrollCue onClick={onHow} />
        </section>
    );
}

/** Most first-time visitors don't know there's a scroll-driven story below the
 * fold - this makes that undeniable instead of hoping they find it. */
function ScrollCue({ onClick }) {
    const reduce = useReducedMotion();
    const { scrollY } = useScroll();
    const fade = useTransform(scrollY, [0, 240], [1, 0]);

    return (
        <motion.button
            type="button"
            className="landing-scroll-cue"
            style={reduce ? undefined : { opacity: fade }}
            onClick={onClick}
            data-testid="landing-scroll-cue"
            aria-label="Scroll to watch what happens next"
        >
            <span>Watch a week disappear</span>
            <ChevronDown className="landing-scroll-cue-icon" aria-hidden="true" />
        </motion.button>
    );
}
