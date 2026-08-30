import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

const NOTES = [
    { id: 'n1', title: 'Demo clip', owner: 'Priya', due: 'Tomorrow', x: -210, y: -86, rot: -13, tone: 'amber' },
    { id: 'n2', title: 'QA signoff', owner: 'Chris', due: 'Fri', x: 198, y: -64, rot: 10, tone: 'rose' },
    { id: 'n3', title: 'Client recap', owner: 'Maya', due: 'Today', x: -118, y: 92, rot: 7, tone: 'sky' },
    { id: 'n4', title: 'Scope check', owner: 'Henrik', due: 'Mon', x: 156, y: 108, rot: -9, tone: 'lilac' },
];

/**
 * Untracked sticky notes gather into a tracked list with owner and due date.
 * Scroll scrubs the gather. Reduced motion snaps to the ordered list.
 */
export default function LandingScrollChaos() {
    const sectionRef = useRef(null);
    const reduceMotion = useReducedMotion();
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ['start 0.85', 'end 0.4'],
    });
    const gather = useTransform(scrollYProgress, [0, 1], [0, 1]);

    return (
        <section
            ref={sectionRef}
            className="landing-story landing-story--scrub"
            data-testid="landing-scroll-chaos"
            aria-label="Notes become a tracked list"
        >
            <div className="landing-stickies-stage">
                {NOTES.map((note, i) => (
                    <StickyNote
                        key={note.id}
                        note={note}
                        index={i}
                        gather={gather}
                        reduceMotion={reduceMotion}
                    />
                ))}
            </div>
        </section>
    );
}

function StickyNote({ note, index, gather, reduceMotion }) {
    const x = useTransform(gather, (v) => (1 - v) * note.x);
    const y = useTransform(gather, (v) => (1 - v) * note.y);
    const rotate = useTransform(gather, (v) => (1 - v) * note.rot);
    const top = 10 + index * 126;

    return (
        <motion.article
            className={`landing-sticky landing-sticky--${note.tone}`}
            style={
                reduceMotion
                    ? { top, left: '50%', marginLeft: '-8.25rem' }
                    : { top, left: '50%', marginLeft: '-8.25rem', x, y, rotate }
            }
        >
            <p className="landing-sticky-title">{note.title}</p>
            <div className="landing-sticky-meta">
                <span className="landing-nametag landing-nametag--ink">{note.owner}</span>
                <span className="landing-clockchip landing-clockchip--ink">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                        <path d="M12 8v4.2l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                    {note.due}
                </span>
            </div>
        </motion.article>
    );
}
