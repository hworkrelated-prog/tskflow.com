import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import LandingFace from '@/components/LandingFace';
import { TskFlowMark } from '@/components/TskFlowLogo';
import { CAST } from '@/lib/landingCast';
import { phaseOn, useStoryClock } from '@/lib/useStoryClock';

const PEEK_PHASES = [
    { id: 'group', dur: 1.2 },
    { id: 'assign', dur: 1.35 },
    { id: 'emoji', dur: 1.4 },
    { id: 'end', dur: 1.15 },
];

const PEEK = [
    { who: 'alex', agree: null },
    { who: 'maya', agree: '✅' },
    { who: 'chris', agree: '👍' },
    { who: 'priya', agree: '👍' },
];

export default function LandingPayoff({ onTry, onHow }) {
    const reduce = useReducedMotion();
    const [know, setKnow] = useState(Boolean(reduce));

    useEffect(() => {
        if (reduce) return undefined;
        const id = window.setTimeout(() => setKnow(true), 900);
        return () => window.clearTimeout(id);
    }, [reduce]);

    return (
        <section className="landing-payoff-hero" data-testid="landing-hero" id="landing-payoff">
            <p className="landing-hero-kicker" data-testid="landing-payoff-kicker">They already said yes.</p>
            <h1 className="landing-payoff-title" data-testid="landing-payoff-title">
                Hand the dirty work to TskFlow.
            </h1>
            <HeroPeek />
            <p
                className={`landing-payoff-know${know ? ' is-on' : ''}`}
                data-testid="landing-payoff-know"
            >
                Cuts the chase. The frustration. The endless back and forth.
            </p>
            <p className="landing-payoff-after" data-testid="landing-payoff-after">
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

function HeroPeek() {
    const { index, reduce } = useStoryClock(PEEK_PHASES);
    const assigned = reduce || phaseOn(index, 1, 3);
    const emoji = reduce || phaseOn(index, 2, 3);
    const ended = reduce || phaseOn(index, 3, 3);

    return (
        <div className="landing-peek" data-testid="landing-payoff-frame" aria-hidden>
            {PEEK.map((tile) => (
                <span key={tile.who} className={`landing-peek-face${assigned && tile.who === 'maya' ? ' is-ask' : ''}`}>
                    <LandingFace who={tile.who} size={52} radius={999} />
                    {tile.agree && emoji ? (
                        <span className="landing-peek-rx">{tile.agree}</span>
                    ) : null}
                </span>
            ))}
            <span className={`landing-peek-bot${ended ? ' is-on' : ''}`}>
                <TskFlowMark size={22} />
            </span>
            <span className="sr-only">{CAST.alex.short} assigned {CAST.maya.short}.</span>
        </div>
    );
}
