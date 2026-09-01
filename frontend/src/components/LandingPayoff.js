import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

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
                <button type="button" className="landing-cta" onClick={onTry} data-testid="landing-hero-cta">
                    Stop being the chase.
                </button>
                <button type="button" className="landing-cta-ghost" onClick={onHow} data-testid="landing-hero-how">
                    See how it works
                </button>
            </div>
        </section>
    );
}
