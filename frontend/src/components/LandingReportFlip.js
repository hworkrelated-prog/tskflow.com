import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Check, Pause, Loader } from 'lucide-react';

const REPORTS = [
    { id: 'done', who: 'Maya', title: 'Forecast', status: 'Done', Icon: Check, tone: 'done' },
    { id: 'move', who: 'Priya', title: 'Demo clip', status: 'Moving', Icon: Loader, tone: 'move' },
    { id: 'stall', who: 'Chris', title: 'Q3 recap', status: 'Stalled', Icon: Pause, tone: 'stall' },
];

/**
 * Daily accountability as flipping report cards. Status is the face, not a caption.
 */
export default function LandingReportFlip() {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ['start 0.85', 'center 0.32'],
    });

    return (
        <section
            ref={ref}
            className="landing-story landing-story--scrub"
            data-testid="landing-report-flip"
            aria-label="Done, moving, stalled"
        >
            <div className="landing-report-row">
                {REPORTS.map((card, i) => (
                    <ReportCard
                        key={card.id}
                        card={card}
                        index={i}
                        progress={scrollYProgress}
                        reduce={reduce}
                    />
                ))}
            </div>
        </section>
    );
}

const ReportCard = ({ card, index, progress, reduce }) => {
    const start = 0.08 + index * 0.18;
    const rotate = useTransform(progress, [start, start + 0.3], [0, 180]);
    const y = useTransform(progress, [0, 1], [28 - index * 10, 0]);

    return (
        <motion.div
            className="landing-report"
            style={{ y: reduce ? 0 : y }}
            data-testid={`landing-report-${card.id}`}
        >
            <motion.div
                className={`landing-report-inner${reduce ? ' is-flipped' : ''}`}
                style={reduce ? undefined : { rotateX: rotate }}
            >
                <div className="landing-report-face landing-report-face--front">
                    <span className="landing-nametag landing-nametag--sm">{card.who}</span>
                    <span className="landing-mini-title">{card.title}</span>
                </div>
                <div className={`landing-report-face landing-report-face--back is-${card.tone}`}>
                    <card.Icon className="w-5 h-5" aria-hidden />
                    <span>{card.status}</span>
                </div>
            </motion.div>
        </motion.div>
    );
};
