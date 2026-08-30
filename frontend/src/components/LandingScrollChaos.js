import React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

/**
 * Raylight-style product film, scrubbed by scroll: a 3D stage of Slack /
 * inbox / stray-ask cards. They tumble in depth, people miss them, then
 * they collapse into one owned ask. Decorative only.
 */
const FLOATS = [
    { id: 'f1', label: 'can you take this?', kind: 'slack', x: [-34, -18, 6], y: [16, 10, 58], z: [180, 80, -40], rx: [16, 8, 2], ry: [-18, -6, 0] },
    { id: 'f2', label: 'where did this go?', kind: 'slack', x: [58, 42, 18], y: [8, 14, 56], z: [140, 40, -20], rx: [10, 4, 1], ry: [14, 6, 0] },
    { id: 'f3', label: 'ping · no reply', kind: 'mail', x: [-22, -8, 8], y: [72, 48, 62], z: [90, 20, -30], rx: [-8, -2, 0], ry: [-10, -4, 0] },
    { id: 'f4', label: 'who owns this?', kind: 'mail', x: [62, 48, 22], y: [68, 46, 60], z: [110, 10, -24], rx: [12, 2, 0], ry: [16, 4, 0] },
    { id: 'f5', label: '@here ??', kind: 'slack', x: [-8, 4, 10], y: [4, 18, 54], z: [220, 60, -10], rx: [18, 6, 1], ry: [-8, 0, 0] },
];

const FloatCard = ({ item, progress }) => {
    const x = useTransform(progress, [0, 0.5, 1], [`${item.x[0]}vw`, `${item.x[1]}vw`, `${item.x[2]}vw`]);
    const y = useTransform(progress, [0, 0.5, 1], [`${item.y[0]}vh`, `${item.y[1]}vh`, `${item.y[2]}vh`]);
    const z = useTransform(progress, [0, 0.5, 1], [item.z[0], item.z[1], item.z[2]]);
    const rotateX = useTransform(progress, [0, 0.5, 1], item.rx);
    const rotateY = useTransform(progress, [0, 0.5, 1], item.ry);
    const opacity = useTransform(progress, [0, 0.1, 0.68, 0.92], [0.82, 0.95, 0.55, 0.05]);
    const blur = useTransform(progress, [0, 0.45, 1], [2.4, 0, 1.2]);
    const filter = useTransform(blur, (v) => `blur(${v}px)`);

    return (
        <motion.div
            className={`landing-chaos-float landing-chaos-float--${item.kind}`}
            style={{ x, y, z, rotateX, rotateY, opacity, filter }}
        >
            <span className="landing-chaos-float-dot" />
            {item.label}
        </motion.div>
    );
};

const SlackPanel = ({ progress }) => {
    const x = useTransform(progress, [0, 0.45, 1], ['-4vw', '-22vw', '6vw']);
    const y = useTransform(progress, [0, 0.45, 1], ['62vh', '22vh', '52vh']);
    const z = useTransform(progress, [0, 0.45, 1], [40, 160, -80]);
    const rotateY = useTransform(progress, [0, 0.45, 1], [18, 28, 4]);
    const rotateX = useTransform(progress, [0, 0.45, 1], [8, 12, 2]);
    const opacity = useTransform(progress, [0, 0.12, 0.7, 0.9], [0.78, 0.95, 0.45, 0]);

    return (
        <motion.div className="landing-chaos-panel landing-chaos-panel--slack" style={{ x, y, z, rotateX, rotateY, opacity }}>
            <div className="landing-chaos-panel-bar">
                <span className="landing-chaos-hash">#</span> sales
                <span className="landing-chaos-unread">12</span>
            </div>
            <p><b>Maya</b> can someone take the forecast</p>
            <p className="is-dim"><b>Chris</b> which one? there are three</p>
            <p><b>Priya</b> I thought Jordan had it</p>
        </motion.div>
    );
};

const InboxPanel = ({ progress }) => {
    const x = useTransform(progress, [0, 0.5, 1], ['62vw', '48vw', '28vw']);
    const y = useTransform(progress, [0, 0.5, 1], ['14vh', '28vh', '54vh']);
    const z = useTransform(progress, [0, 0.5, 1], [120, 40, -60]);
    const rotateY = useTransform(progress, [0, 0.5, 1], [-22, -14, -2]);
    const rotateX = useTransform(progress, [0, 0.5, 1], [14, 6, 1]);
    const opacity = useTransform(progress, [0, 0.14, 0.72, 0.92], [0.8, 0.95, 0.4, 0]);

    return (
        <motion.div className="landing-chaos-panel landing-chaos-panel--inbox" style={{ x, y, z, rotateX, rotateY, opacity }}>
            <div className="landing-chaos-panel-bar">Inbox · 47 unread</div>
            <p>Re: Re: Re: the ask from Tuesday</p>
            <p className="is-dim">Fwd: looping you in again</p>
            <p>nudged twice · still open</p>
        </motion.div>
    );
};

const CatchHand = ({ progress, side }) => {
    const fromX = side === 'left' ? -14 : 104;
    const midX = side === 'left' ? 14 : 74;
    const toX = side === 'left' ? 32 : 54;
    const x = useTransform(progress, [0, 0.42, 1], [`${fromX}vw`, `${midX}vw`, `${toX}vw`]);
    const y = useTransform(progress, [0, 0.42, 1], ['76vh', '56vh', '68vh']);
    const z = useTransform(progress, [0, 0.42, 1], [200, 80, -20]);
    const opacity = useTransform(progress, [0.08, 0.22, 0.58, 0.8], [0, 0.5, 0.22, 0]);
    const rotate = useTransform(progress, [0, 0.42, 1], side === 'left' ? [18, -10, 0] : [-18, 12, 0]);

    return (
        <motion.div className="landing-chaos-hand" style={{ x, y, z, opacity, rotate }} aria-hidden>
            <svg width="58" height="58" viewBox="0 0 56 56" fill="none">
                <path
                    d="M18 32c0-6 3-10 7-10 2 0 3 1 4 3V16c0-3 2-5 5-5s5 2 5 5v7c1-2 3-3 5-3 3 0 5 3 5 6v13c0 7-6 12-13 12h-3c-8 0-15-6-15-14v-6z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                />
            </svg>
        </motion.div>
    );
};

const LandingScrollChaos = () => {
    const reduce = useReducedMotion();
    const { scrollYProgress } = useScroll();
    const camY = useTransform(scrollYProgress, [0, 1], [-10, 8]);
    const camX = useTransform(scrollYProgress, [0, 1], [8, -6]);
    const captionA = useTransform(scrollYProgress, [0, 0.26, 0.4], [0.95, 0.55, 0]);
    const captionB = useTransform(scrollYProgress, [0.3, 0.48, 0.7], [0, 0.88, 0]);
    const captionC = useTransform(scrollYProgress, [0.6, 0.8, 1], [0, 0.85, 0.3]);
    const gather = useTransform(scrollYProgress, [0.58, 0.92], [0, 0.65]);

    if (reduce) {
        return (
            <div className="landing-chaos landing-chaos--still" aria-hidden data-testid="landing-scroll-chaos">
                <div className="landing-chaos-vignette" />
            </div>
        );
    }

    return (
        <div className="landing-chaos" aria-hidden data-testid="landing-scroll-chaos">
            <div className="landing-chaos-vignette" />
            <motion.div className="landing-chaos-world" style={{ rotateX: camX, rotateY: camY }}>
                <SlackPanel progress={scrollYProgress} />
                <InboxPanel progress={scrollYProgress} />
                {FLOATS.map((item) => (
                    <FloatCard key={item.id} item={item} progress={scrollYProgress} />
                ))}
                <CatchHand progress={scrollYProgress} side="left" />
                <CatchHand progress={scrollYProgress} side="right" />
                <motion.div className="landing-chaos-gather" style={{ opacity: gather }} />
            </motion.div>
            <motion.p className="landing-chaos-caption landing-chaos-caption--a" style={{ opacity: captionA }}>
                Asks bounce around Slack.
            </motion.p>
            <motion.p className="landing-chaos-caption landing-chaos-caption--b" style={{ opacity: captionB }}>
                People keep missing them.
            </motion.p>
            <motion.p className="landing-chaos-caption landing-chaos-caption--c" style={{ opacity: captionC }}>
                One ask. Followed through.
            </motion.p>
        </div>
    );
};

export default LandingScrollChaos;
