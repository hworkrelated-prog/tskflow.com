import React from 'react';
import { motion, useInView } from 'framer-motion';
import {
    Mic,
    MicOff,
    Video,
    Phone,
    Captions,
    Hand,
    MoreVertical,
    Info,
    Star,
    Smile,
    Paperclip,
    AtSign,
    Archive,
    Clock,
    Trash2,
    Mail,
    CornerUpLeft,
    CornerUpRight,
} from 'lucide-react';
import LandingFace from '@/components/LandingFace';
import { CAST } from '@/lib/landingCast';

const SLACK_MESSAGES = [
    {
        id: 'yes',
        who: 'alex',
        time: '2:14 PM',
        text: 'Maya - can you send the Q3 forecast by Friday?',
        commit: true,
    },
    {
        id: 'ok',
        who: 'maya',
        time: '2:15 PM',
        text: "Yep, I'll have this done by Friday.",
        reactions: [
            { mark: '✅', n: 1 },
            { mark: '👍', n: 2 },
        ],
    },
    { id: 'n1', who: 'chris', time: '2:41 PM', text: 'Quick question on Acme - you around?' },
    { id: 'n2', who: 'priya', time: '3:08 PM', text: 'Can you also jump on the QBR deck?' },
    { id: 'n3', who: 'jordan', time: '3:22 PM', text: 'Need this by EOD if you can.' },
    { id: 'n4', who: 'chris', time: '4:03 PM', text: 'Sync moved to 3 tomorrow.' },
    { id: 'n5', who: 'priya', time: '4:47 PM', text: 'Can you jump on this call?' },
    {
        id: 'chase',
        who: 'alex',
        time: 'Fri 4:52 PM',
        text: 'Hey - quick update on this?',
        chase: true,
    },
];

export default function LandingLived() {
    return (
        <section className="landing-lived" data-testid="landing-lived" id="landing-lived">
            <MeetScene />
            <SlackScene />
            <GmailScene />
        </section>
    );
}

function MeetScene() {
    return (
        <article className="landing-lived-block" data-testid="landing-lived-meet">
            <p className="landing-lived-caption">They agreed. In Google Meet.</p>
            <div className="gmeet" aria-label="Google Meet">
                <header className="gmeet-top">
                    <span className="gmeet-title">Q3 pipeline</span>
                    <span className="gmeet-time">3:11 PM</span>
                    <span className="gmeet-top-ico" aria-hidden><Info size={16} /></span>
                </header>
                <div className="gmeet-grid">
                    <MeetTile who="alex" you />
                    <MeetTile who="maya" speaking caption="Yep, I'll have this done by Friday." />
                    <MeetTile who="chris" muted />
                    <MeetTile who="priya" />
                </div>
                <p className="gmeet-cc" data-testid="landing-meet-caption">
                    Maya Chen: Yep, I'll have this done by Friday.
                </p>
                <nav className="gmeet-bar" aria-hidden>
                    <span className="gmeet-btn"><Mic size={18} /></span>
                    <span className="gmeet-btn"><Video size={18} /></span>
                    <span className="gmeet-btn"><Captions size={18} /></span>
                    <span className="gmeet-btn"><Hand size={18} /></span>
                    <span className="gmeet-btn"><MoreVertical size={18} /></span>
                    <span className="gmeet-btn is-leave"><Phone size={18} /></span>
                </nav>
            </div>
        </article>
    );
}

function MeetTile({ who, you, speaking, muted, caption }) {
    const person = CAST[who];
    return (
        <div className={`gmeet-tile${speaking ? ' is-speaking' : ''}${you ? ' is-you' : ''}`}>
            <img src={person.photo} alt="" />
            <span className="gmeet-name">
                {muted ? <MicOff size={12} /> : <Mic size={12} />}
                {person.short}
                {you ? ' (You)' : ''}
            </span>
            {caption ? <span className="sr-only">{caption}</span> : null}
        </div>
    );
}

function SlackScene() {
    const ref = React.useRef(null);
    const on = useInView(ref, { once: true, amount: 0.35 });

    return (
        <article className="landing-lived-block" data-testid="landing-lived-slack" ref={ref}>
            <p className="landing-lived-caption">Then Slack swallowed it.</p>
            <div className="slack" aria-label="Slack">
                <aside className="slack-side">
                    <p className="slack-ws">Acme Sales</p>
                    <p className="slack-sec">Channels</p>
                    <p className="is-on"># q3-forecast</p>
                    <p># deals</p>
                    <p># general</p>
                    <p className="slack-sec">Direct messages</p>
                    <p>Maya Chen</p>
                    <p>Chris Park</p>
                </aside>
                <div className="slack-main">
                    <header className="slack-head">
                        <b># q3-forecast</b>
                        <span><Star size={14} /> 8</span>
                    </header>
                    <p className="slack-date">Monday, September 1st</p>
                    <div className="slack-msgs">
                        {SLACK_MESSAGES.map((msg, i) => (
                            <motion.div
                                key={msg.id}
                                className={`slack-msg${msg.commit ? ' is-commit' : ''}${msg.chase ? ' is-chase' : ''}`}
                                data-testid={`landing-slack-msg-${msg.id}`}
                                initial={{ opacity: 0, y: 8 }}
                                animate={on ? { opacity: 1, y: 0 } : { opacity: 0.2, y: 8 }}
                                transition={{ duration: 0.28, delay: 0.08 + i * 0.09 }}
                            >
                                <LandingFace who={msg.who} size={36} radius={8} />
                                <div>
                                    <p className="slack-meta">
                                        <b>{CAST[msg.who].name}</b>
                                        <time>{msg.time}</time>
                                    </p>
                                    <p className="slack-text">{msg.text}</p>
                                    {msg.reactions ? (
                                        <p className="slack-rx">
                                            {msg.reactions.map((rx) => (
                                                <span key={rx.mark}>{rx.mark} {rx.n}</span>
                                            ))}
                                        </p>
                                    ) : null}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                    <div className="slack-compose">
                        <span>Message #q3-forecast</span>
                        <span className="slack-compose-icos" aria-hidden>
                            <AtSign size={16} />
                            <Smile size={16} />
                            <Paperclip size={16} />
                        </span>
                    </div>
                </div>
            </div>
        </article>
    );
}

function GmailScene() {
    return (
        <article className="landing-lived-block" data-testid="landing-lived-gmail">
            <p className="landing-lived-caption">Friday. You're in their inbox.</p>
            <div className="gmail" aria-label="Gmail">
                <header className="gmail-top">
                    <GmailMark />
                    <span className="gmail-word">Gmail</span>
                    <span className="gmail-search">Search mail</span>
                </header>
                <div className="gmail-body">
                    <aside className="gmail-side">
                        <span className="gmail-compose">Compose</span>
                        <span className="is-on"><Mail size={16} /> Inbox</span>
                    </aside>
                    <article className="gmail-read">
                        <h3>Q3 forecast</h3>
                        <div className="gmail-tools" aria-hidden>
                            <Archive size={18} />
                            <Trash2 size={18} />
                            <Clock size={18} />
                        </div>
                        <div className="gmail-from">
                            <LandingFace who="alex" size={40} radius={20} />
                            <div>
                                <p>
                                    <b>{CAST.alex.name}</b>
                                    {' '}
                                    <span>&lt;{CAST.alex.email}&gt;</span>
                                </p>
                                <p>to {CAST.maya.short}</p>
                            </div>
                            <time>Fri 4:52 PM</time>
                        </div>
                        <p className="gmail-text" data-testid="landing-gmail-body">
                            Hey - quick update on this?
                        </p>
                        <div className="gmail-reply">
                            <span><CornerUpLeft size={14} /> Reply</span>
                            <span><CornerUpRight size={14} /> Forward</span>
                        </div>
                    </article>
                </div>
            </div>
        </article>
    );
}

function GmailMark() {
    return (
        <svg className="gmail-m" viewBox="0 0 24 24" width="28" height="28" aria-hidden>
            <path fill="#4285F4" d="M1.5 6.5v11A2.5 2.5 0 0 0 4 20h2.2V9.3L12 13.4l5.8-4.1V20H20a2.5 2.5 0 0 0 2.5-2.5v-11L12 13.4z" />
            <path fill="#EA4335" d="M1.5 6.5 12 13.4 4 6.2A2.6 2.6 0 0 0 1.5 6.5z" />
            <path fill="#FBBC04" d="M22.5 6.5A2.6 2.6 0 0 0 20 6.2L12 13.4z" />
            <path fill="#34A853" d="M20 20h-2.2V9.3L22.5 6.5V17.5A2.5 2.5 0 0 1 20 20z" />
        </svg>
    );
}
