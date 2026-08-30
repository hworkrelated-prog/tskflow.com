import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock, User } from 'lucide-react';
import { colorizeAssignPrompt, PROMPT_SEGMENT_CLASS } from '@/lib/landingAssignDemo';

export const HERO_ASK = 'Ask Maya to send the Q3 forecast by Friday.';

const ease = [0.22, 1, 0.36, 1];

const STEPS = [
    { id: 'ask', n: '1', label: 'Ask' },
    { id: 'who', n: '2', label: 'Who' },
    { id: 'send', n: '3', label: 'Send' },
];

const PHASE_I = { type: 0, split: 1, card: 2 };

const TypedLine = ({ text, done }) => (
    <p className="landing-hero-sentence" data-testid="landing-hero-sentence">
        {colorizeAssignPrompt(text).map((part, i) => (
            <span
                key={`${part.kind}-${i}`}
                className={PROMPT_SEGMENT_CLASS[part.kind] || PROMPT_SEGMENT_CLASS.plain}
            >
                {part.text}
            </span>
        ))}
        {!done && <span className="landing-hero-caret" aria-hidden />}
    </p>
);

const AssembledCard = ({ visible }) => (
    <motion.article
        className="landing-hero-card"
        data-testid="landing-hero-card"
        initial={false}
        animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 22, scale: 0.96 }}
        transition={{ duration: 0.55, ease }}
        aria-hidden={!visible}
    >
        <div className="landing-hero-card-row">
            <span className="landing-fly-chip landing-fly-chip--inline">
                <span className="landing-fly-kicker">Who</span>
                <span className="landing-nametag">
                    <User className="w-3.5 h-3.5" aria-hidden />
                    Maya
                </span>
            </span>
            <span className="landing-fly-chip landing-fly-chip--inline">
                <span className="landing-fly-kicker">Work</span>
                <span className="landing-hero-work-chip">Q3 forecast</span>
            </span>
            <span className="landing-fly-chip landing-fly-chip--inline">
                <span className="landing-fly-kicker">When</span>
                <span className="landing-clockchip">
                    <Clock className="w-3.5 h-3.5" aria-hidden />
                    Friday
                </span>
            </span>
        </div>
        <p className="landing-hero-card-title">Send the Q3 forecast</p>
        <span className="landing-hero-check" aria-hidden />
    </motion.article>
);

/**
 * Types a sales assign. Who / work / when peel off as labeled chips, then land on a card.
 */
export default function LandingHeroAsk() {
    const reduce = useReducedMotion();
    const [typed, setTyped] = useState(reduce ? HERO_ASK : '');
    const [phase, setPhase] = useState(reduce ? 'card' : 'type');

    useEffect(() => {
        if (reduce) return undefined;
        let cancelled = false;
        let timer;

        const wait = (ms) => new Promise((resolve) => {
            timer = window.setTimeout(resolve, ms);
        });

        const run = async () => {
            while (!cancelled) {
                setPhase('type');
                setTyped('');
                for (let i = 1; i <= HERO_ASK.length; i += 1) {
                    if (cancelled) return;
                    setTyped(HERO_ASK.slice(0, i));
                    await wait(24);
                }
                await wait(420);
                if (cancelled) return;
                setPhase('split');
                await wait(1100);
                if (cancelled) return;
                setPhase('card');
                await wait(2600);
            }
        };

        run();
        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [reduce]);

    const showSentence = phase === 'type' || phase === 'split';
    const showCard = phase === 'card' || reduce;

    return (
        <div className="landing-hero-ask" data-testid="landing-hero-ask">
            <ol className="landing-hero-steps" data-testid="landing-hero-steps">
                {STEPS.map((s, i) => {
                    const active = PHASE_I[phase] ?? 0;
                    const state = i < active ? 'is-done' : i === active ? 'is-on' : '';
                    return (
                        <li key={s.id} className={state}>
                            {i > 0 ? <span className="landing-hero-step-line" aria-hidden /> : null}
                            <span className="landing-hero-step-n">{s.n}</span>
                            {s.label}
                        </li>
                    );
                })}
            </ol>
            <div className="landing-hero-stage">
                {showSentence && (
                    <motion.div
                        key={phase === 'split' ? 'split' : 'type'}
                        animate={
                            phase === 'split'
                                ? { opacity: 0, y: -10, filter: 'blur(3px)' }
                                : { opacity: 1, y: 0, filter: 'blur(0px)' }
                        }
                        transition={{ duration: 0.55, ease }}
                    >
                        <TypedLine text={typed} done={phase !== 'type'} />
                    </motion.div>
                )}
                {phase === 'split' && (
                    <div className="landing-hero-fly" aria-hidden>
                        <motion.span
                            className="landing-fly-chip"
                            initial={{ y: 16, opacity: 0, scale: 0.9 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, ease }}
                        >
                            <span className="landing-fly-kicker">Who</span>
                            <span className="landing-nametag">
                                <User className="w-3.5 h-3.5" />
                                Maya
                            </span>
                        </motion.span>
                        <motion.span
                            className="landing-fly-chip"
                            initial={{ y: 16, opacity: 0, scale: 0.9 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, ease, delay: 0.06 }}
                        >
                            <span className="landing-fly-kicker">Work</span>
                            <span className="landing-hero-work-chip">Q3 forecast</span>
                        </motion.span>
                        <motion.span
                            className="landing-fly-chip"
                            initial={{ y: 16, opacity: 0, scale: 0.9 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, ease, delay: 0.12 }}
                        >
                            <span className="landing-fly-kicker">When</span>
                            <span className="landing-clockchip">
                                <Clock className="w-3.5 h-3.5" />
                                Friday
                            </span>
                        </motion.span>
                    </div>
                )}
                <AssembledCard visible={showCard} />
            </div>
        </div>
    );
}
