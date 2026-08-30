import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Mail, MessageSquare, Calendar, Video } from 'lucide-react';

const SalesforceMark = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M10.2 6.4c.7-1.2 2-2 3.4-2 1.7 0 3.1 1 3.7 2.5 1.5-.4 3.1.5 3.5 2 .4 1.6-.5 3.2-2 3.7v.1c0 2.2-1.8 4-4 4H8.4C6 16.7 4 14.7 4 12.2c0-2.2 1.6-4 3.7-4.3.5-1 1.5-1.7 2.5-1.5z" />
    </svg>
);

const LOGOS = [
    { id: 'email', label: 'Email', Icon: Mail },
    { id: 'slack', label: 'Slack', Icon: MessageSquare },
    { id: 'calendar', label: 'Calendar', Icon: Calendar },
    { id: 'salesforce', label: 'Salesforce', Icon: SalesforceMark },
    { id: 'meet', label: 'Meet', Icon: Video },
];

const SCENES = ['hound', 'motive', 'meet'];

/** Motion-first product story. Almost no copy. */
export default function LandingIntegrations() {
    const reduce = useReducedMotion();
    const [scene, setScene] = useState(0);

    useEffect(() => {
        if (reduce) return undefined;
        const t = window.setInterval(() => setScene((s) => (s + 1) % SCENES.length), 4200);
        return () => window.clearInterval(t);
    }, [reduce]);

    const id = SCENES[scene];

    return (
        <section
            className="landing-story landing-story--slim landing-integ-story"
            data-testid="landing-integrations"
            aria-label="Email, Slack, Calendar, Salesforce, Meet"
        >
            <div className="landing-integ-stage" data-testid={`landing-scene-${id}`}>
                {id === 'hound' && <HoundScene reduce={reduce} />}
                {id === 'motive' && <MotiveScene reduce={reduce} />}
                {id === 'meet' && <MeetScene reduce={reduce} />}
            </div>
            <div className="landing-integ-dots" aria-hidden>
                {SCENES.map((s, i) => (
                    <button
                        key={s}
                        type="button"
                        className={`landing-integ-dot ${i === scene ? 'is-on' : ''}`}
                        onClick={() => setScene(i)}
                        aria-label={s}
                    />
                ))}
            </div>
            <div className="landing-integ-row">
                {LOGOS.map((item) => (
                    <span
                        key={item.id}
                        className="landing-integ"
                        title={item.label}
                        aria-label={item.label}
                        data-testid={`landing-integ-${item.id}`}
                    >
                        <item.Icon className="w-5 h-5" />
                    </span>
                ))}
            </div>
        </section>
    );
}

const PEOPLE = [
    { n: 'C', silent: true },
    { n: 'P', silent: true },
    { n: 'J', silent: false },
    { n: 'M', silent: true },
    { n: 'A', silent: true },
];

function HoundScene({ reduce }) {
    return (
        <div className="hound-scene" data-testid="landing-hound">
            <span className="integ-mark">Hound</span>
            <div className="hound-row">
                {PEOPLE.map((p, i) => (
                    <motion.span
                        key={p.n + i}
                        className={`hound-face ${p.silent ? 'is-silent' : 'is-live'}`}
                        initial={reduce ? false : { opacity: 0.35, y: 6 }}
                        animate={p.silent ? { opacity: 0.38, scale: 0.92 } : { opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.08, duration: 0.45 }}
                    >
                        {p.n}
                    </motion.span>
                ))}
                <motion.span
                    className="hound-runner"
                    aria-hidden
                    initial={reduce ? false : { x: -28, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
            </div>
            <div className="hound-slack">
                {['On it', "Can't", 'Blocked', 'Done'].map((label, i) => (
                    <motion.span
                        key={label}
                        className={`hound-chip ${i === 0 ? 'is-go' : ''}`}
                        initial={reduce ? false : { y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.35 + i * 0.08 }}
                    >
                        {label}
                    </motion.span>
                ))}
            </div>
        </div>
    );
}

function MotiveScene({ reduce }) {
    return (
        <div className="motive-scene" data-testid="landing-motive">
            <span className="integ-mark">Motive</span>
            <div className="motive-board">
                {['Call', 'Opp', 'Commit'].map((label, i) => (
                    <motion.div
                        key={label}
                        className={`motive-card ${i === 1 ? 'is-hit' : ''}`}
                        initial={reduce ? false : { y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: i * 0.12 }}
                    >
                        <span className="motive-bar" style={{ width: `${40 + i * 22}%` }} />
                        {i === 1 && <span className="motive-check" aria-hidden />}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

function MeetScene({ reduce }) {
    return (
        <div className="meet-scene" data-testid="landing-meet">
            <span className="integ-mark">Meet</span>
            <div className="meet-lines" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                    <motion.span
                        key={i}
                        className="meet-line"
                        initial={reduce ? false : { scaleX: 1, opacity: 0.55 }}
                        animate={{ scaleX: 0.2 + i * 0.12, opacity: 0.2 }}
                        transition={{ delay: 0.15 + i * 0.08, duration: 0.6 }}
                    />
                ))}
            </div>
            <div className="meet-chips">
                {['Forecast', 'Call log', 'Clip'].map((label, i) => (
                    <motion.span
                        key={label}
                        className="meet-chip"
                        initial={reduce ? false : { y: 16, opacity: 0, scale: 0.9 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: 0.45 + i * 0.1, type: 'spring', stiffness: 260, damping: 20 }}
                    >
                        {label}
                    </motion.span>
                ))}
            </div>
            <motion.span
                className="meet-send"
                initial={reduce ? false : { scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.95, type: 'spring', stiffness: 280, damping: 16 }}
            />
        </div>
    );
}
