import React from 'react';
import { motion, useInView } from 'framer-motion';

const STEPS = [
    {
        id: 'capture',
        n: '01',
        title: 'Capture',
        lead: 'Someone commits.',
        quote: "I'll have this done Friday.",
        body: 'TskFlow turns the commitment into an assigned task.',
    },
    {
        id: 'schedule',
        n: '02',
        title: 'Schedule',
        lead: 'Time gets blocked on the calendar.',
        quote: 'Friday 9:30.',
        body: 'The task has a place to actually happen.',
    },
    {
        id: 'follow',
        n: '03',
        title: 'Follow up',
        lead: 'If someone goes quiet, TskFlow follows up.',
        quote: 'Still waiting on the forecast.',
        body: "The manager doesn't have to.",
    },
    {
        id: 'verify',
        n: '04',
        title: 'Verify',
        lead: 'TskFlow shows what actually happened.',
        quote: 'Done. Not done. At risk.',
        body: 'No guessing.',
    },
];

export default function LandingDifference() {
    return (
        <section className="landing-diff" data-testid="landing-difference" id="landing-difference">
            <p className="landing-section-kicker">What changes</p>
            <h2 className="landing-section-title" data-testid="landing-diff-title">
                TskFlow keeps the "yes."
            </h2>
            <ol className="landing-diff-steps">
                {STEPS.map((step, i) => (
                    <DiffStep key={step.id} step={step} index={i} />
                ))}
            </ol>
        </section>
    );
}

function DiffStep({ step, index }) {
    const ref = React.useRef(null);
    const on = useInView(ref, { once: true, amount: 0.45 });
    return (
        <motion.li
            ref={ref}
            className="landing-diff-step"
            data-testid={`landing-diff-${step.id}`}
            initial={{ opacity: 0, y: 18 }}
            animate={on ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 18 }}
            transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
            <span className="landing-diff-n">{step.n}</span>
            <div>
                <h3>{step.title}</h3>
                <p>{step.lead}</p>
                <p className="landing-diff-quote">{step.quote}</p>
                <p className="landing-diff-body">{step.body}</p>
            </div>
        </motion.li>
    );
}
