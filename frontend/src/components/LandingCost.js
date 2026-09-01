import React, { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

const WEEKLY_HOURS = 1.5;
const YEARLY_HOURS = 78;
const WORK_DAYS = 10;

export default function LandingCost() {
    const hold = useRef(null);
    const inView = useInView(hold, { once: true, amount: 0.4 });
    const hours = useCount(YEARLY_HOURS, inView, 1.4);
    const tenths = useCount(WEEKLY_HOURS * 10, inView, 1.1);

    return (
        <section className="landing-cost" data-testid="landing-cost" ref={hold} id="landing-cost">
            <p className="landing-section-kicker">The cost</p>
            <h2 className="landing-section-title" data-testid="landing-cost-title">
                The work isn't always the problem. Keeping track of the work is.
            </h2>
            <div className="landing-cost-nums">
                <article data-testid="landing-cost-week">
                    <b>{(tenths / 10).toFixed(1)}</b>
                    <span>hours every week</span>
                    <p>spent chasing status updates and approvals.</p>
                </article>
                <article data-testid="landing-cost-year">
                    <b>{hours}</b>
                    <span>hours every year</span>
                    <p>spent asking people what happened to work they already agreed to do.</p>
                </article>
            </div>
            <p className="landing-cost-days" data-testid="landing-cost-days">
                That's almost two full work weeks. About {WORK_DAYS} working days a year.
            </p>
            <p className="landing-cost-point" data-testid="landing-cost-point">
                You don't have a people problem. You have a follow-up problem.
            </p>
            <p className="landing-cost-note" data-testid="landing-cost-note">
                78 hours a year asking, "Did you get this done?" That's the cost of the problem. Not a product promise.
            </p>
        </section>
    );
}

function useCount(target, live, seconds) {
    const reduce = useReducedMotion();
    const [value, setValue] = useState(reduce ? target : 0);

    useEffect(() => {
        if (!live) return undefined;
        if (reduce) {
            setValue(target);
            return undefined;
        }
        const start = performance.now();
        let raf;
        const tick = (now) => {
            const t = Math.min(1, (now - start) / (seconds * 1000));
            const eased = 1 - (1 - t) ** 3;
            setValue(Math.round(target * eased));
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [live, reduce, seconds, target]);

    return value;
}
