import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MessageSquare, Tag, Send, ChevronRight } from 'lucide-react';

const STEPS = [
    { id: 'ask', label: 'Ask', Icon: MessageSquare },
    { id: 'who', label: 'Who', Icon: Tag },
    { id: 'send', label: 'Send', Icon: Send },
];

const ease = [0.22, 1, 0.36, 1];

/** Product flow as three icons with arrows. No paragraph. */
export default function LandingFlowIcons() {
    const reduce = useReducedMotion();

    return (
        <section className="landing-story" data-testid="landing-flow-icons" aria-label="Ask, who, send">
            <div className="landing-flow-row">
                {STEPS.map((step, i) => (
                    <React.Fragment key={step.id}>
                        {i > 0 ? (
                            <ChevronRight className="landing-flow-arrow w-5 h-5" aria-hidden />
                        ) : null}
                        <motion.div
                            className="landing-flow-step"
                            data-testid={`landing-flow-${step.id}`}
                            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.88 }}
                            whileInView={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
                            viewport={{ once: true, amount: 0.55 }}
                            transition={{ duration: 0.5, delay: i * 0.12, ease }}
                        >
                            <motion.span
                                className="landing-flow-icon"
                                animate={reduce ? undefined : { y: [0, -6, 0] }}
                                transition={
                                    reduce
                                        ? undefined
                                        : { duration: 2.4, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }
                                }
                            >
                                <step.Icon className="w-6 h-6" aria-hidden />
                            </motion.span>
                            <span className="landing-step-kicker landing-flow-label">{step.label}</span>
                        </motion.div>
                    </React.Fragment>
                ))}
            </div>
        </section>
    );
}
