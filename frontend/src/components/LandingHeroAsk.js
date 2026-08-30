import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Clock, User } from 'lucide-react';
import { colorizeAssignPrompt, PROMPT_SEGMENT_CLASS } from '@/lib/landingAssignDemo';

export const HERO_ASK = 'Ask engineering to record a demo of the fix by tomorrow.';

const ease = [0.22, 1, 0.36, 1];

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
            <span className="landing-nametag">
                <User className="w-3.5 h-3.5" aria-hidden />
                engineering
            </span>
            <span className="landing-clockchip">
                <Clock className="w-3.5 h-3.5" aria-hidden />
                tomorrow
            </span>
        </div>
        <p className="landing-hero-card-title">Record a demo of the fix</p>
        <span className="landing-hero-check" aria-hidden />
    </motion.article>
);

/**
 * Types a real assign sentence. The who-word becomes a name tag, the deadline
 * becomes a clock, and both land on one task card. That motion is the product.
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
                    await wait(26);
                }
                await wait(380);
                if (cancelled) return;
                setPhase('split');
                await wait(900);
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
                            className="landing-nametag"
                            initial={{ x: -40, y: -8, opacity: 0, scale: 0.82 }}
                            animate={{ x: -72, y: 48, opacity: 1, scale: 1 }}
                            transition={{ duration: 0.62, ease }}
                        >
                            <User className="w-3.5 h-3.5" />
                            engineering
                        </motion.span>
                        <motion.span
                            className="landing-hero-work-chip"
                            initial={{ y: 4, opacity: 0, scale: 0.94 }}
                            animate={{ y: 52, opacity: 1, scale: 1 }}
                            transition={{ duration: 0.62, ease, delay: 0.05 }}
                        >
                            record a demo of the fix
                        </motion.span>
                        <motion.span
                            className="landing-clockchip"
                            initial={{ x: 40, y: -8, opacity: 0, scale: 0.82 }}
                            animate={{ x: 72, y: 48, opacity: 1, scale: 1 }}
                            transition={{ duration: 0.62, ease, delay: 0.1 }}
                        >
                            <Clock className="w-3.5 h-3.5" />
                            tomorrow
                        </motion.span>
                    </div>
                )}
                <AssembledCard visible={showCard} />
            </div>
        </div>
    );
}
