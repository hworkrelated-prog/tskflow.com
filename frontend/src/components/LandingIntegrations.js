import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Mail, MessageSquare, Calendar, Video } from 'lucide-react';
import LandingCastMark from '@/components/LandingCastMark';
import { CAST, TASKS, WEEK } from '@/lib/landingCast';

const SalesforceMark = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M10.2 6.4c.7-1.2 2-2 3.4-2 1.7 0 3.1 1 3.7 2.5 1.5-.4 3.1.5 3.5 2 .4 1.6-.5 3.2-2 3.7v.1c0 2.2-1.8 4-4 4H8.4C6 16.7 4 14.7 4 12.2c0-2.2 1.6-4 3.7-4.3.5-1 1.5-1.7 2.5-1.5z" />
    </svg>
);

const LOGOS = [
    { id: 'email', label: 'Email', Icon: Mail, scene: 'email' },
    { id: 'slack', label: 'Slack', Icon: MessageSquare, scene: 'hound' },
    { id: 'calendar', label: 'Calendar', Icon: Calendar, scene: 'calendar' },
    { id: 'salesforce', label: 'Salesforce', Icon: SalesforceMark, scene: 'motive' },
    { id: 'meet', label: 'Meet', Icon: Video, scene: 'meet' },
];

const SCENES = [
    {
        id: 'email',
        caption: 'The ask lands in their inbox. Owner. Due date. One click to accept.',
    },
    {
        id: 'hound',
        caption: 'If they go quiet, TskFlow follows up in Slack. Not you.',
    },
    {
        id: 'calendar',
        caption: 'When they accept, it blocks time on their calendar.',
    },
    {
        id: 'motive',
        caption: 'When they do the work, it shows up as proof in Salesforce.',
    },
    {
        id: 'meet',
        caption: 'What they agreed to on the call becomes an assigned ask.',
    },
];

/** How TskFlow shows up in the tools managers already live in. Plain words, working buttons. */
export default function LandingIntegrations() {
    const reduce = useReducedMotion();
    const [scene, setScene] = useState(0);

    useEffect(() => {
        if (reduce) return undefined;
        const t = window.setInterval(() => setScene((s) => (s + 1) % SCENES.length), 5600);
        return () => window.clearInterval(t);
    }, [reduce]);

    const current = SCENES[scene];
    const id = current.id;

    return (
        <section
            className="landing-story landing-integ-story"
            data-testid="landing-integrations"
            aria-label="Email, Slack, Calendar, Salesforce, Meet"
        >
            <p className="landing-integ-caption" data-testid="landing-integ-caption">
                {current.caption}
            </p>
            <div className="landing-integ-stage" data-testid={`landing-scene-${id}`}>
                {id === 'email' && <EmailScene reduce={reduce} />}
                {id === 'hound' && <HoundScene reduce={reduce} />}
                {id === 'calendar' && <CalendarScene reduce={reduce} />}
                {id === 'motive' && <MotiveScene reduce={reduce} />}
                {id === 'meet' && <MeetScene reduce={reduce} />}
            </div>
            <div className="landing-integ-dots" aria-hidden>
                {SCENES.map((s, i) => (
                    <button
                        key={s.id}
                        type="button"
                        className={`landing-integ-dot ${i === scene ? 'is-on' : ''}`}
                        onClick={() => setScene(i)}
                        aria-label={LOGOS.find((logo) => logo.scene === s.id)?.label || s.id}
                    />
                ))}
            </div>
            <div className="landing-integ-row">
                {LOGOS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`landing-integ ${item.scene === id ? 'is-on' : ''}`}
                        title={item.label}
                        aria-label={item.label}
                        data-testid={`landing-integ-${item.id}`}
                        onClick={() => {
                            const next = SCENES.findIndex((s) => s.id === item.scene);
                            if (next >= 0) setScene(next);
                        }}
                    >
                        <item.Icon className="w-5 h-5" />
                        <span className="landing-integ-name">{item.label}</span>
                    </button>
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

function EmailScene({ reduce }) {
    const task = TASKS[0];
    return (
        <div className="email-scene" data-testid="landing-email">
            <article className="landing-mail-card">
                <p className="landing-mail-from">TskFlow</p>
                <p className="landing-mail-subject">{task.title}</p>
                <div className="landing-mail-who">
                    <LandingCastMark who="maya" size="sm" />
                    <span>{CAST.maya.name}</span>
                    <span className="landing-clockchip landing-clockchip--sm">{task.due}</span>
                </div>
                <motion.span
                    className="landing-mail-accept"
                    initial={reduce ? false : { scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.35, type: 'spring', stiffness: 280, damping: 16 }}
                >
                    Accept
                </motion.span>
            </article>
        </div>
    );
}

function CalendarScene({ reduce }) {
    return (
        <div className="cal-scene" data-testid="landing-integ-calendar">
            <div className="landing-week landing-week--integ">
                {WEEK.map((day) => (
                    <div key={day.d} className={`landing-week-day${day.open ? ' is-open' : ''}`}>
                        <span>{day.d}</span>
                        {day.busy.map((busy, i) => (
                            <span key={`${day.d}-${i}`} className={`landing-cal-slot${busy ? ' is-busy' : ' is-due'}`} />
                        ))}
                    </div>
                ))}
            </div>
            <motion.div
                className="landing-cal-chip landing-cal-chip--integ"
                initial={reduce ? false : { x: -80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 220, damping: 18 }}
            >
                <LandingCastMark who="maya" size="sm" />
                <span>{TASKS[0].title}</span>
            </motion.div>
        </div>
    );
}

function HoundScene({ reduce }) {
    return (
        <div className="hound-scene" data-testid="landing-hound">
            <div className="hound-chase">
                <div className="hound-row">
                    {PEOPLE.map((p, i) => (
                        <motion.span
                            key={p.n + i}
                            className={`hound-face ${p.silent ? 'is-silent' : 'is-live'}`}
                            initial={reduce ? false : { opacity: 0.35, y: 8 }}
                            animate={p.silent ? { opacity: 0.38, scale: 0.92 } : { opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.06, duration: 0.4 }}
                        >
                            {p.n}
                        </motion.span>
                    ))}
                </div>
                <span className="hound-runner" aria-hidden />
                <span className="hound-ring" aria-hidden />
            </div>
            <div className="hound-slack">
                {['On it', "Can't", 'Blocked', 'Done'].map((label, i) => (
                    <motion.span
                        key={label}
                        className={`hound-chip ${i === 0 ? 'is-go' : ''}`}
                        initial={reduce ? false : { y: 14, opacity: 0, scale: 0.86 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: 0.45 + i * 0.08, type: 'spring', stiffness: 280, damping: 18 }}
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
            <div className="motive-board">
                {['Call', 'Opp', 'Commit'].map((label, i) => (
                    <motion.div
                        key={label}
                        className={`motive-card ${i === 1 ? 'is-hit' : ''}`}
                        initial={reduce ? false : { y: 16, opacity: 0, rotateX: -12 }}
                        animate={{ y: 0, opacity: 1, rotateX: 0 }}
                        transition={{ delay: i * 0.12, type: 'spring', stiffness: 220, damping: 18 }}
                    >
                        <span className="motive-name">{label}</span>
                        <span className="motive-bar" style={{ '--fill': `${42 + i * 22}%` }} />
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
            <div className="meet-lines" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                    <motion.span
                        key={i}
                        className="meet-line"
                        initial={reduce ? false : { scaleX: 1, opacity: 0.7 }}
                        animate={{ scaleX: 0.18 + i * 0.1, opacity: 0.16 }}
                        transition={{ delay: 0.08 + i * 0.07, duration: 0.7 }}
                    />
                ))}
            </div>
            <div className="meet-chips">
                {['Forecast', 'Call log', 'Clip'].map((label, i) => (
                    <motion.span
                        key={label}
                        className="meet-chip"
                        initial={reduce ? false : { y: 22, opacity: 0, scale: 0.82 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        transition={{ delay: 0.55 + i * 0.1, type: 'spring', stiffness: 280, damping: 16 }}
                    >
                        {label}
                    </motion.span>
                ))}
            </div>
            <motion.span
                className="meet-send"
                initial={reduce ? false : { scale: 0.55, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1.05, type: 'spring', stiffness: 320, damping: 14 }}
            />
        </div>
    );
}
