import React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import LandingFace from '@/components/LandingFace';
import { TskFlowMark } from '@/components/TskFlowLogo';
import { CAST } from '@/lib/landingCast';

const PEEK_PHASES = [
    { id: 'group', dur: 4.8, line: 'A meeting starts. Work gets a name and a date.' },
    { id: 'assign', dur: 5.2, line: 'Alex asks Maya for the Q3 forecast by Friday.' },
    { id: 'emoji', dur: 5.2, line: 'They all say yes. The meeting still ends.' },
    { id: 'end', dur: 4.6, line: 'TskFlow takes the follow-up, so you do not have to.' },
];

const PEEK = [
    { who: 'alex', agree: null },
    { who: 'maya', agree: '✅' },
    { who: 'chris', agree: '👍' },
    { who: 'priya', agree: '👍' },
];

const PLOT = [
    { n: '1', lead: 'They say yes', rest: ' in the meeting.' },
    { n: '2', lead: 'You chase them', rest: ' all week after.' },
    { n: '3', lead: 'TskFlow chases them', rest: ' instead.' },
];

export default function LandingPayoff({ onTry, onHow }) {
    return (
        <section className="landing-payoff-hero" data-testid="landing-hero" id="landing-payoff">
            <p className="landing-hero-kicker" data-testid="landing-payoff-kicker">
                After the meeting, they already said yes.
            </p>
            <h1 className="landing-payoff-title" data-testid="landing-payoff-title">
                TskFlow follows up so you do not have to.
            </h1>
            <ol className="landing-hero-plot" data-testid="landing-hero-plot">
                {PLOT.map((row) => (
                    <li key={row.n}>
                        <i>{row.n}</i>
                        <span>
                            <b>{row.lead}</b>
                            {row.rest}
                        </span>
                    </li>
                ))}
            </ol>
            <HeroPeek />
            <p className="sr-only" data-testid="landing-payoff-know">
                Cuts the chase. The frustration. The endless back and forth.
            </p>
            <p className="sr-only" data-testid="landing-payoff-after">
                Your relationship with the team stays intact.
            </p>
            <p className="sr-only" data-testid="landing-pain-line">
                Hand the dirty work to TskFlow.
            </p>
            <p className="sr-only" data-testid="landing-point">
                Someone says yes. Then you spend the week inspecting, reporting, catching people, and having the tough conversations.
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
            <span>Scroll to watch it happen</span>
            <ChevronDown className="landing-scroll-cue-icon" aria-hidden="true" />
        </motion.button>
    );
}

function HeroPeek() {
    return (
        <div className="landing-peek-wrap landing-peek-wrap--still">
            <div className="landing-peek landing-peek--still" data-testid="landing-payoff-frame" aria-hidden>
                {PEEK.map((tile) => (
                    <span key={tile.who} className="landing-peek-face">
                        <LandingFace who={tile.who} size={44} radius={999} />
                        {tile.agree ? (
                            <span className="landing-peek-rx">{tile.agree}</span>
                        ) : null}
                    </span>
                ))}
                <span className="landing-peek-bot is-on">
                    <TskFlowMark size={20} />
                </span>
                <span className="sr-only">{CAST.alex.short} assigned {CAST.maya.short}.</span>
            </div>
            <p className="sr-only" data-testid="landing-peek-line">{PEEK_PHASES[0].line}</p>
            <ul className="sr-only">
                {PEEK_PHASES.slice(1).map((phase) => (
                    <li key={phase.id}>{phase.line}</li>
                ))}
            </ul>
        </div>
    );
}
