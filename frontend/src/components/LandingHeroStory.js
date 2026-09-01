import React, { useRef } from 'react';
import { useInView } from 'framer-motion';
import { Mic, Video, PhoneOff } from 'lucide-react';
import LandingCastMark from '@/components/LandingCastMark';
import { CAST } from '@/lib/landingCast';
import { phaseOn, useStoryClock } from '@/lib/useStoryClock';

export const HERO_PHASES = [
    { id: 'commit', dur: 1.55, line: 'Send the Q3 forecast by Friday.' },
    { id: 'yes', dur: 1.45, line: "Yep, I'll have this done by Friday." },
    { id: 'slack', dur: 1.15, line: 'The yes lands in Slack.' },
    { id: 'pile', dur: 1.55, line: 'Then Slack explodes.' },
    { id: 'meetings', dur: 1.2, line: 'More meetings. More work.' },
    { id: 'bury', dur: 1.35, line: 'The original commitment gets buried.' },
    { id: 'friday', dur: 1.05, line: 'Friday arrives.' },
    { id: 'chase', dur: 1.55, line: 'Hey - quick update on this?' },
    { id: 'pause', dur: 0.95, line: "Still don't know if it got done." },
    { id: 'capture', dur: 1.25, line: 'TskFlow keeps the yes.' },
    { id: 'assign', dur: 1.0, line: 'Assigned. Maya owns it.' },
    { id: 'calendar', dur: 1.1, line: 'Friday is blocked on the calendar.' },
    { id: 'progress', dur: 1.1, line: 'Progress updates itself.' },
    { id: 'status', dur: 1.35, line: 'Done. At risk. Waiting.' },
    { id: 'relief', dur: 2.15, line: 'You stop being the chase.' },
];

const NOISE = [
    { id: 'n1', at: 3, who: 'chris', text: 'Quick question...' },
    { id: 'n2', at: 3, who: 'priya', text: 'Can you also...' },
    { id: 'n3', at: 4, who: 'jordan', text: 'Need this by EOD.' },
    { id: 'n4', at: 4, who: 'chris', text: 'Sync moved to 3.' },
    { id: 'n5', at: 5, who: 'priya', text: 'Can you jump on this call?' },
];

export default function LandingHeroStory({ onTry, onHow }) {
    return (
        <section className="landing-hero-story" data-testid="landing-hero">
            <div className="landing-hero-copy">
                <p className="landing-hero-kicker" data-testid="landing-pain-more">
                    Managers should not be the reminder system.
                </p>
                <h1 className="landing-hero-line" data-testid="landing-pain-line">
                    Your managers shouldn't have to remember for everyone.
                </h1>
                <p className="landing-hero-sub" data-testid="landing-point">
                    Someone says "Yes, I'll get it done." Then Slack swallows it. More work piles on.
                    Friday hits. You're chasing for an update - and still don't know if it actually got done.
                </p>
                <div className="landing-hero-ctas">
                    <button type="button" className="landing-cta" onClick={onTry} data-testid="landing-hero-cta">
                        Stop being the chase.
                    </button>
                    <button type="button" className="landing-cta-ghost" onClick={onHow} data-testid="landing-hero-how">
                        See how it works
                    </button>
                </div>
            </div>
            <HeroReel />
        </section>
    );
}

function HeroReel() {
    const hold = useRef(null);
    const inView = useInView(hold, { amount: 0.35 });
    const { index, phase, reduce, total, elapsed } = useStoryClock(HERO_PHASES, { playing: inView });
    const fill = reduce ? 100 : Math.min(100, (elapsed / total) * 100);

    return (
        <div className="landing-reel" ref={hold} data-testid="landing-hero-reel" aria-label="A week of chasing, then TskFlow">
            <header className="landing-reel-head">
                <span className={phaseOn(index, 0, 1) ? 'is-on' : ''}>Meet</span>
                <span className={phaseOn(index, 2, 8) ? 'is-on' : ''}>Slack</span>
                <span className={phaseOn(index, 9, 14) ? 'is-on' : ''}>TskFlow</span>
            </header>
            <div className="landing-reel-stage">
                <MeetLayer on={phaseOn(index, 0, 1)} yes={phaseOn(index, 1, 1)} />
                <SlackLayer index={index} />
                <FlowLayer index={index} />
            </div>
            <p className="landing-reel-line" data-testid="landing-hero-caption" aria-live="polite">{phase.line}</p>
            <div className="landing-reel-meter" aria-hidden>
                <span style={{ width: `${fill}%` }} />
            </div>
        </div>
    );
}

function MeetLayer({ on, yes }) {
    return (
        <div className={`landing-reel-layer landing-reel-meet${on ? ' is-on' : ''}`} data-testid="landing-hero-meet">
            <p className="landing-meet-kicker">
                <span className="landing-meet-dot" aria-hidden />
                Meet
            </p>
            <div className="landing-meet landing-meet--reel">
                <div className="landing-meet-grid landing-meet-grid--two">
                    <article className="landing-meet-tile is-you">
                        <LandingCastMark who="hashim" size="lg" />
                        <span className="landing-meet-name">{CAST.hashim.name}</span>
                    </article>
                    <article className="landing-meet-tile">
                        <LandingCastMark who="maya" size="lg" />
                        <span className="landing-meet-name">{CAST.maya.name}</span>
                        <span className={`landing-meet-agree${yes ? ' is-on' : ''}`} aria-hidden>✅</span>
                    </article>
                </div>
                <p className="landing-meet-ask">Send the Q3 forecast by Friday.</p>
                <div className="landing-meet-bar" aria-hidden>
                    <span className="landing-meet-ctl"><Mic className="w-4 h-4" /><span>Mic</span></span>
                    <span className="landing-meet-ctl"><Video className="w-4 h-4" /><span>Video</span></span>
                    <span className="landing-meet-ctl is-end"><PhoneOff className="w-4 h-4" /><span>Leave</span></span>
                </div>
            </div>
        </div>
    );
}

function SlackLayer({ index }) {
    const on = phaseOn(index, 2, 8);
    const buried = phaseOn(index, 5, 8);
    const friday = phaseOn(index, 6, 8);
    const chase = phaseOn(index, 7, 8);
    const pause = phaseOn(index, 8, 8);

    return (
        <div className={`landing-reel-layer landing-reel-slack${on ? ' is-on' : ''}${pause ? ' is-pause' : ''}`} data-testid="landing-hero-slack">
            <article className="landing-slack landing-slack--reel">
                <div className="landing-slack-head">
                    <LandingCastMark who="hashim" size="sm" />
                    <span className="landing-slack-name">{CAST.hashim.name}</span>
                    <span className="landing-slack-time">{friday ? 'Fri' : 'Mon'}</span>
                </div>
                <p className={`landing-slack-body landing-commit-line${buried ? ' is-buried' : ''}`}>
                    Send the Q3 forecast by Friday.
                </p>
                <div className="landing-slack-noise">
                    {NOISE.map((msg) => (
                        <p
                            key={msg.id}
                            className={`landing-noise${index >= msg.at ? ' is-on' : ''}${buried && index >= 5 ? ' is-cover' : ''}`}
                        >
                            <LandingCastMark who={msg.who} size="sm" />
                            <span>{msg.text}</span>
                        </p>
                    ))}
                </div>
                {chase ? (
                    <p className="landing-chase-ask" data-testid="landing-hero-nudge">
                        <LandingCastMark who="hashim" size="sm" />
                        <span>Hey - quick update on this?</span>
                    </p>
                ) : null}
            </article>
        </div>
    );
}

function FlowLayer({ index }) {
    const on = phaseOn(index, 9, 14);
    const assigned = phaseOn(index, 10, 14);
    const cal = phaseOn(index, 11, 14);
    const progress = phaseOn(index, 12, 14);
    const status = phaseOn(index, 13, 14);
    const relief = phaseOn(index, 14, 14);

    return (
        <div className={`landing-reel-layer landing-reel-flow${on ? ' is-on' : ''}`} data-testid="landing-hero-flow">
            <article className="landing-flow-card">
                <header className="landing-flow-card-head">
                    <span>Q3 forecast</span>
                    {assigned ? (
                        <span className="landing-nametag landing-nametag--sm">
                            <LandingCastMark who="maya" size="sm" /> Maya
                        </span>
                    ) : (
                        <span className="landing-clockchip landing-clockchip--sm">Capturing</span>
                    )}
                </header>
                {cal ? (
                    <p className="landing-cal-chip landing-cal-chip--inline">Fri · 9:30-10:30</p>
                ) : null}
                <div className={`landing-progress${progress ? ' is-on' : ''}`} aria-hidden>
                    <span style={{ width: progress ? (relief ? '100%' : '62%') : '8%' }} />
                </div>
                {status ? (
                    <div className="landing-status-row" data-testid="landing-hero-status">
                        <span className="landing-status is-done">Done</span>
                        <span className="landing-status is-risk">At risk</span>
                        <span className="landing-status is-wait">Waiting</span>
                    </div>
                ) : null}
                {relief ? (
                    <p className="landing-relief" data-testid="landing-hero-relief">You stop being the chase.</p>
                ) : null}
            </article>
        </div>
    );
}
