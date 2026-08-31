import React from 'react';
import { motion, useTransform } from 'framer-motion';
import { Mic, Video, PhoneOff } from 'lucide-react';
import LandingPinBeat, { BeatStage } from '@/components/LandingPinBeat';
import LandingCastMark from '@/components/LandingCastMark';
import { CAST } from '@/lib/landingCast';

const TILES = [
    { person: CAST.hashim, you: true },
    { person: CAST.maya, agree: '✅', at: 0.16 },
    { person: CAST.chris, agree: '👍', at: 0.22 },
    { person: CAST.priya, agree: '👍', at: 0.28 },
];

const REACTIONS = [
    { id: 'ok', mark: '✅', n: 3, at: 0.64 },
    { id: 'up', mark: '👍', n: 4, at: 0.72 },
];

/** Beat 2: assign live in Meet, then the same task lands in Slack. */
export default function LandingAssignBeat() {
    return (
        <LandingPinBeat
            testId="landing-assign"
            label="Assignment"
            caption="They agreed. In the meeting."
            spans={2.4}
        >
            {(progress) => <AssignFrames progress={progress} />}
        </LandingPinBeat>
    );
}

function AssignFrames({ progress }) {
    const meetOp = useTransform(progress, [0, 0.48, 0.58], [1, 1, 0]);
    const meetY = useTransform(progress, [0, 0.5, 0.6], [0, 0, -24]);
    const slackOp = useTransform(progress, [0.5, 0.6, 1], [0, 1, 1]);
    const slackY = useTransform(progress, [0.5, 0.62], [28, 0]);
    const mosaicOp = useTransform(progress, [0.58, 0.68], [0, 1]);

    return (
        <BeatStage className="landing-assign-stage">
            <motion.div
                className="landing-meet-block"
                style={{ opacity: meetOp, y: meetY }}
            >
            <p className="landing-meet-kicker" data-testid="landing-meet-kicker">
                <span className="landing-meet-dot" aria-hidden />
                Meet
            </p>
            <div
                className="landing-meet"
                data-testid="landing-meet-frame"
            >
                <div className="landing-meet-grid">
                    {TILES.map((tile) => (
                        <MeetTile key={tile.person.id} tile={tile} progress={progress} />
                    ))}
                </div>
                <p className="landing-meet-ask" data-testid="landing-meet-ask">
                    Send the Q3 forecast.
                </p>
                <div className="landing-meet-bar" data-testid="landing-meet-bar" aria-hidden>
                    <span className="landing-meet-ctl"><Mic className="w-4 h-4" /><span>Mic</span></span>
                    <span className="landing-meet-ctl"><Video className="w-4 h-4" /><span>Video</span></span>
                    <span className="landing-meet-ctl is-end"><PhoneOff className="w-4 h-4" /><span>Leave</span></span>
                </div>
            </div>
            </motion.div>

            <motion.article
                className="landing-slack"
                data-testid="landing-slack-post"
                style={{ opacity: slackOp, y: slackY }}
            >
                <div className="landing-slack-head">
                    <LandingCastMark who="hashim" size="sm" />
                    <span className="landing-slack-name">{CAST.hashim.name}</span>
                    <span className="landing-slack-time">2:14</span>
                </div>
                <p className="landing-slack-body">Send the Q3 forecast.</p>
                <motion.div
                    className="slack-mosaic slack-mosaic--2 landing-slack-mosaic"
                    data-testid="landing-slack-images"
                    style={{ opacity: mosaicOp }}
                >
                    <span className="slack-tile landing-shot landing-shot--pipe">
                        <img src="/landing-pipeline.svg" alt="" />
                    </span>
                    <span className="slack-tile landing-shot landing-shot--crm">
                        <img src="/landing-crm.svg" alt="" />
                    </span>
                </motion.div>
                <div className="landing-slack-rx" data-testid="landing-slack-reactions">
                    {REACTIONS.map((rx) => (
                        <SlackRx key={rx.id} rx={rx} progress={progress} />
                    ))}
                </div>
            </motion.article>
        </BeatStage>
    );
}

function MeetTile({ tile, progress }) {
    return (
        <article
            className={`landing-meet-tile${tile.you ? ' is-you' : ''}`}
            data-testid={`landing-meet-tile-${tile.person.id}`}
        >
            <LandingCastMark who={tile.person} size="lg" />
            <span className="landing-meet-name">{tile.person.name}</span>
            {tile.agree ? <Agree progress={progress} at={tile.at} mark={tile.agree} /> : null}
        </article>
    );
}

function Agree({ progress, at, mark }) {
    const opacity = useTransform(progress, [at, at + 0.06], [0, 1]);
    const scale = useTransform(progress, [at, at + 0.07], [0.35, 1]);
    return (
        <motion.span className="landing-meet-agree" style={{ opacity, scale }} aria-hidden>
            {mark}
        </motion.span>
    );
}

function SlackRx({ rx, progress }) {
    const opacity = useTransform(progress, [rx.at, rx.at + 0.08], [0, 1]);
    const y = useTransform(progress, [rx.at, rx.at + 0.08], [10, 0]);
    return (
        <motion.span className="landing-slack-chip" style={{ opacity, y }}>
            {rx.mark} {rx.n}
        </motion.span>
    );
}
