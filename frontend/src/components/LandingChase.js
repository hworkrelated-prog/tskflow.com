import React from 'react';
import { motion, useTransform } from 'framer-motion';
import { Bell, FileText, Send } from 'lucide-react';
import LandingPinBeat from '@/components/LandingPinBeat';
import LandingCastMark from '@/components/LandingCastMark';
import { CAST } from '@/lib/landingCast';

const PINGS = [
    { id: 'p1', text: 'Follow up with lead', Icon: Send, at: 0.08 },
    { id: 'p2', text: 'pipeline.png', Icon: FileText, at: 0.2 },
    { id: 'p3', text: 'Follow up with lead', Icon: Bell, at: 0.32 },
    { id: 'p4', text: 'pipeline.png', Icon: FileText, at: 0.44 },
    { id: 'p5', text: 'Follow up with lead', Icon: Send, at: 0.56 },
    { id: 'p6', text: 'nudge', Icon: Bell, at: 0.68 },
    { id: 'p7', text: 'nudge', Icon: Bell, at: 0.8 },
];

/** Beat 5: the manager becomes the reminder. Grey, repetitive, tiring. */
export default function LandingChase() {
    return (
        <LandingPinBeat testId="landing-chase" label="You chase" spans={2.2} tone="wear">
            {(progress) => <ChaseFrame progress={progress} />}
        </LandingPinBeat>
    );
}

function ChaseFrame({ progress }) {
    const wear = useTransform(progress, [0.1, 1], [0.15, 1]);
    const gray = useTransform(wear, (v) => `grayscale(${v})`);
    const fade = useTransform(wear, (v) => 1 - v * 0.28);

    return (
        <motion.div
            className="landing-chase landing-chase--labor"
            data-testid="landing-chase-pings"
            style={{ filter: gray, opacity: fade }}
        >
            <div className="landing-chase-who">
                <LandingCastMark who="hashim" />
                <span>{CAST.hashim.name}</span>
            </div>
            <div className="landing-chase-col">
                {PINGS.map((ping, i) => (
                    <Ping key={ping.id} ping={ping} index={i} progress={progress} />
                ))}
            </div>
        </motion.div>
    );
}

function Ping({ ping, index, progress }) {
    const opacity = useTransform(progress, [ping.at, ping.at + 0.1], [0, 0.92 - index * 0.08]);
    const x = useTransform(progress, [ping.at, ping.at + 0.12], [-22, 0]);
    const Icon = ping.Icon;
    return (
        <motion.div className="landing-chase-ping" style={{ opacity, x }} data-testid={`landing-chase-${ping.id}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden />
            {ping.text}
        </motion.div>
    );
}
