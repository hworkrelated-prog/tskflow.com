import React from 'react';
import { motion, useReducedMotion, useTransform } from 'framer-motion';

/** Published Dora story URL, when Hashim has one. Native sequence is the fallback. */
export const DORA_STORY_URL = process.env.REACT_APP_DORA_STORY_URL || '';

export const MEET_FRAMES = [
    { src: '/landing/story/tskflow-story-01-meet.webp', at: 0 },
    { src: '/landing/story/tskflow-story-02-yes.webp', at: 0.38 },
    { src: '/landing/story/tskflow-story-03-ended.webp', at: 0.72 },
];

export const CATCH_FRAMES = [
    { src: '/landing/story/tskflow-story-04-chase.webp', at: 0 },
    { src: '/landing/story/tskflow-story-05-talk.webp', at: 0.52 },
];

export const FLOW_FRAMES = [
    { src: '/landing/story/tskflow-story-06-tskflow.webp', at: 0 },
];

function FrameLayer({ progress, frame, nextAt, isFirst, isLast, reduce }) {
    const start = frame.at;
    const fade = 0.12;
    const opacity = useTransform(
        progress,
        isLast
            ? [start, Math.min(start + fade, 1), 1]
            : isFirst
                ? [0, nextAt, nextAt + fade]
                : [start, start + fade, nextAt, nextAt + fade],
        isLast
            ? [isFirst ? 1 : 0, 1, 1]
            : isFirst
                ? [1, 1, 0]
                : [0, 1, 1, 0],
    );

    return (
        <motion.img
            src={frame.src}
            alt=""
            className="landing-dora-frame"
            style={reduce ? { opacity: isLast ? 1 : 0 } : { opacity }}
            draggable={false}
        />
    );
}

/** Scroll-scrubbed cinematic stills — Dora-style image sequence on the landing. */
export default function LandingDoraSequence({ progress, frames, testId }) {
    const reduce = useReducedMotion();
    if (DORA_STORY_URL) return null;

    return (
        <div className="landing-dora-sequence" data-testid={testId}>
            {frames.map((frame, i) => (
                <FrameLayer
                    key={frame.src}
                    progress={progress}
                    frame={frame}
                    nextAt={frames[i + 1]?.at ?? 1}
                    isFirst={i === 0}
                    isLast={i === frames.length - 1}
                    reduce={reduce}
                />
            ))}
        </div>
    );
}

export function LandingDoraEmbed() {
    if (!DORA_STORY_URL) return null;
    return (
        <div className="landing-dora-live" data-testid="landing-dora-embed-wrap">
            <iframe
                className="landing-dora-embed"
                src={DORA_STORY_URL}
                title="TskFlow story"
                data-testid="landing-dora-embed"
                allow="fullscreen"
            />
        </div>
    );
}
