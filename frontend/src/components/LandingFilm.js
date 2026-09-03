import React, { useState } from 'react';
import {
    motion,
    useMotionValueEvent,
    useTransform,
} from 'framer-motion';
import {
    Archive,
    Bell,
    Captions,
    Clock,
    FileText,
    Hand,
    Info,
    Mail,
    MessageSquare,
    Mic,
    MicOff,
    MoreVertical,
    Phone,
    Search,
    Sparkles,
    Trash2,
    Users,
    Video,
} from 'lucide-react';
import LandingPinBeat, { BeatStage } from '@/components/LandingPinBeat';
import LandingFace from '@/components/LandingFace';
import LandingCastMark from '@/components/LandingCastMark';
import AccountabilityScore from '@/components/AccountabilityScore';
import { TskFlowMark } from '@/components/TskFlowLogo';
import { CAST, TASKS } from '@/lib/landingCast';

const MEET_PEOPLE = [
    { who: 'alex', you: true, mute: false, speakAt: [0.12, 0.40], agree: null, task: null },
    { who: 'maya', you: false, mute: false, speakAt: [0.40, 0.62], agree: '✅', agreeAt: 0.54, task: TASKS[0] },
    { who: 'chris', you: false, mute: true, speakAt: null, agree: '👍', agreeAt: 0.60, task: TASKS[1] },
    { who: 'priya', you: false, mute: false, speakAt: null, agree: '👍', agreeAt: 0.66, task: TASKS[2] },
];

const MEET_CAPTIONS = [
    { at: 0, lock: 'A group of people.', text: 'Four people on a call. One of them is you — Alex.' },
    { at: 0.16, lock: 'The organizer assigned a task.', text: 'Alex asks Maya to send the Q3 forecast by Friday.' },
    { at: 0.48, lock: 'Everyone acknowledged.', text: 'Maya says yes. Chris and Priya say yes too.' },
    { at: 0.74, lock: 'The meeting concluded.', text: 'The meeting ends. The promises just walk out the door.' },
];

const CATCH_CAPTIONS = [
    { at: 0, lock: 'Now you inspect what you expected.', text: 'Friday. The forecast is not there. Now you go looking.' },
    { at: 0.20, lock: 'Build the report.', text: 'You build a list of who missed.' },
    { at: 0.40, lock: 'Catch people.', text: 'Then you ping them. You are the nag now.' },
    { at: 0.58, lock: 'Have the tough conversation.', text: 'Then the awkward 1:1: this is the third Friday.' },
    { at: 0.76, lock: 'Document the continuous misses.', text: 'If it keeps happening, you start a file for HR.' },
];

const FLOW_CAPTIONS = [
    { at: 0, lock: 'TskFlow joins your meet.', text: 'Same meeting. TskFlow is on the call too.' },
    { at: 0.28, lock: 'Leaves with every task.', text: 'It leaves with every task, owner, and date.' },
    { at: 0.52, lock: 'Gets after the assignees.', text: 'It follows up with Maya. Not you.' },
    { at: 0.80, lock: 'Your relationship stays intact.', text: 'You stay the manager. Not the reminder.' },
];

const LINES = [
    { at: 0.14, who: 'alex', text: 'Maya, send the Q3 forecast by Friday.' },
    { at: 0.42, who: 'maya', text: "Yep, I'll have this done by Friday." },
];

const FILE_STEPS = [
    'Record the 1:1',
    'Screenshot Slack',
    'Write it up yourself',
    'Hope HR can use it',
];

const PERF = [
    { who: 'priya', score: 94, label: 'Strong', done: 12, assigned: 12 },
    { who: 'chris', score: 71, label: 'Solid', done: 9, assigned: 12 },
    { who: 'maya', score: 41, label: 'At risk', done: 4, assigned: 10 },
    { who: 'jordan', score: 18, label: 'Needs work', done: 2, assigned: 11 },
];

const REPORT_ROWS = [
    { who: 'maya', item: 'Q3 forecast', state: 'Missing' },
    { who: 'chris', item: 'Acme proposal', state: 'Late' },
    { who: 'priya', item: 'Salesforce stage', state: 'Done' },
    { who: 'jordan', item: 'Discovery log', state: 'Missing' },
];

const FLOW_STEPS = ['Capture', 'Schedule', 'Follow up', 'Verify'];

const CHASE_LINES = [
    'Did you get this?',
    'Hey - quick update on this?',
    "What's the status?",
];

function captionFor(beats, v) {
    let beat = beats[0];
    for (const item of beats) {
        if (v >= item.at) beat = item;
    }
    return beat;
}

function lineFor(v) {
    let line = LINES[0];
    for (const item of LINES) {
        if (v >= item.at) line = item;
    }
    return line;
}

function ScrubCaption({ progress, beats, testId }) {
    const [beat, setBeat] = useState(() => captionFor(beats, progress.get()));
    useMotionValueEvent(progress, 'change', (v) => setBeat(captionFor(beats, v)));
    return (
        <p className="landing-pin-now" data-testid={testId} aria-live="polite">
            {beat.text}
            <span className="sr-only">{beat.lock}</span>
        </p>
    );
}

export default function LandingFilm() {
    return (
        <div id="landing-film" data-testid="landing-film">
            <LandingPinBeat
                testId="landing-film-meet"
                label="The meeting"
                thesis="They said yes. Then the meeting ended."
                step={1}
                totalSteps={3}
                spans={3.8}
            >
                {(progress) => (
                    <>
                        <ScrubCaption progress={progress} beats={MEET_CAPTIONS} testId="landing-film-caption" />
                        <BeatStage className="landing-film-stage">
                            <div className="landing-film-act" data-testid="landing-meet-act">
                                <MeetScene progress={progress} />
                            </div>
                        </BeatStage>
                    </>
                )}
            </LandingPinBeat>

            <LandingPinBeat
                testId="landing-film-catch"
                label="You chase"
                thesis="After yes, you become the reminder system."
                step={2}
                totalSteps={3}
                spans={4.6}
            >
                {(progress) => (
                    <>
                        <ScrubCaption progress={progress} beats={CATCH_CAPTIONS} testId="landing-film-caption-catch" />
                        <BeatStage className="landing-film-stage">
                            <div className="landing-film-act" data-testid="landing-catch-act">
                                <CatchScene progress={progress} />
                            </div>
                        </BeatStage>
                    </>
                )}
            </LandingPinBeat>

            <LandingPinBeat
                testId="landing-film-flow"
                label="TskFlow takes it"
                thesis="TskFlow does the reminding so you do not."
                step={3}
                totalSteps={3}
                spans={4.2}
            >
                {(progress) => (
                    <>
                        <ScrubCaption progress={progress} beats={FLOW_CAPTIONS} testId="landing-film-caption-flow" />
                        <BeatStage className="landing-film-stage">
                            <div className="landing-film-act" data-testid="landing-flow-act">
                                <FlowScene progress={progress} />
                            </div>
                        </BeatStage>
                    </>
                )}
            </LandingPinBeat>
        </div>
    );
}

function MeetScene({ progress }) {
    const askOp = useTransform(progress, [0.10, 0.18], [0, 1]);
    const endedOp = useTransform(progress, [0.76, 0.86], [0, 1]);
    const leaveScale = useTransform(progress, [0.72, 0.84], [1, 1.18]);
    const gridDim = useTransform(progress, [0.76, 0.86], [1, 0.38]);
    const [line, setLine] = useState(() => lineFor(progress.get()));
    useMotionValueEvent(progress, 'change', (v) => setLine(lineFor(v)));

    return (
        <div className="gmeet gmeet--film" data-testid="landing-meet-frame" aria-label="Google Meet">
            <header className="gmeet-top">
                <span className="gmeet-title">Q3 pipeline</span>
                <span className="gmeet-time">3:11 PM</span>
                <span className="gmeet-top-ico" aria-hidden><Info size={16} /></span>
            </header>
            <motion.div className="gmeet-grid" style={{ opacity: gridDim }}>
                {MEET_PEOPLE.map((tile) => (
                    <MeetTile key={tile.who} tile={tile} progress={progress} />
                ))}
            </motion.div>
            <motion.p className="gmeet-cc" data-testid="landing-meet-caption" style={{ opacity: askOp }}>
                {CAST[line.who].short}: {line.text}
            </motion.p>
            <nav className="gmeet-bar" aria-hidden>
                <span className="gmeet-btn"><Mic size={18} /></span>
                <span className="gmeet-btn"><Video size={18} /></span>
                <span className="gmeet-btn"><Captions size={18} /></span>
                <span className="gmeet-btn"><Hand size={18} /></span>
                <span className="gmeet-btn"><MoreVertical size={18} /></span>
                <motion.span className="gmeet-btn is-leave" style={{ scale: leaveScale }}><Phone size={18} /></motion.span>
            </nav>
            <motion.p className="landing-meet-ended" style={{ opacity: endedOp }} data-testid="landing-meet-ended">
                Meeting ended
            </motion.p>
            <p className="sr-only">Maya Chen owns the Q3 forecast.</p>
        </div>
    );
}

function MeetTile({ tile, progress }) {
    const person = CAST[tile.who];
    const speakFrom = tile.speakAt ? tile.speakAt[0] : 2;
    const speakTo = tile.speakAt ? tile.speakAt[1] : 2.2;
    const speaking = useTransform(
        progress,
        [speakFrom, speakFrom + 0.05, speakTo, speakTo + 0.05],
        tile.speakAt ? [0, 1, 1, 0] : [0, 0, 0, 0],
    );
    const enter = useTransform(progress, [0.02, 0.12], [0.92, 1]);
    const ring = useTransform(speaking, (v) => (v > 0.5 ? 'inset 0 0 0 3px #34a853' : 'inset 0 0 0 0px transparent'));

    return (
        <motion.div
            className={`gmeet-tile${tile.you ? ' is-you' : ''}`}
            data-testid={`landing-meet-tile-${tile.who}`}
            style={{ scale: enter, boxShadow: ring }}
        >
            <LandingFace who={tile.who} size={220} radius={0} />
            <span className="gmeet-name">
                {tile.mute ? <MicOff size={12} /> : <Mic size={12} />}
                {person.short}
                {tile.you ? ' (You)' : ''}
            </span>
            {tile.task ? <TaskChip task={tile.task} progress={progress} at={0.20} /> : null}
            {tile.agree ? <Agree mark={tile.agree} progress={progress} at={tile.agreeAt} /> : null}
        </motion.div>
    );
}

function TaskChip({ task, progress, at }) {
    const opacity = useTransform(progress, [at, at + 0.08], [0, 1]);
    const y = useTransform(progress, [at, at + 0.10], [12, 0]);
    return (
        <motion.span className="landing-meet-task" style={{ opacity, y }} data-testid={`landing-meet-task-${task.id}`}>
            {task.title}
        </motion.span>
    );
}

function Agree({ mark, progress, at }) {
    const opacity = useTransform(progress, [at, at + 0.07], [0, 1]);
    const scale = useTransform(progress, [at, at + 0.08], [0.3, 1]);
    const y = useTransform(progress, [at, at + 0.10], [10, 0]);
    return (
        <motion.span className="landing-meet-react" style={{ opacity, scale, y }} aria-hidden>
            {mark}
        </motion.span>
    );
}

function CatchScene({ progress }) {
    const inspectOp = useTransform(progress, [0, 0.04, 0.16, 0.22], [1, 1, 1, 0]);
    const reportOp = useTransform(progress, [0.18, 0.24, 0.36, 0.42], [0, 1, 1, 0]);
    const catchOp = useTransform(progress, [0.38, 0.44, 0.54, 0.60], [0, 1, 1, 0]);
    const talkOp = useTransform(progress, [0.56, 0.62, 0.72, 0.78], [0, 1, 1, 0]);
    const fileOp = useTransform(progress, [0.74, 0.82, 1], [0, 1, 1]);

    return (
        <div className="landing-catch" data-testid="landing-catch-frame">
            <motion.div className="landing-film-layer" style={{ opacity: inspectOp }} data-testid="landing-catch-inspect">
                <InspectCard progress={progress} />
            </motion.div>
            <motion.div className="landing-film-layer" style={{ opacity: reportOp }} data-testid="landing-catch-report">
                <ReportCard progress={progress} />
            </motion.div>
            <motion.div className="landing-film-layer" style={{ opacity: catchOp }} data-testid="landing-catch-people">
                <PeopleCard />
            </motion.div>
            <motion.div className="landing-film-layer" style={{ opacity: talkOp }} data-testid="landing-catch-talk">
                <TalkCard />
            </motion.div>
            <motion.div className="landing-film-layer" style={{ opacity: fileOp }} data-testid="landing-catch-file">
                <FileCard progress={progress} />
            </motion.div>
        </div>
    );
}

function InspectCard({ progress }) {
    return (
        <article className="landing-inspect">
            <p className="landing-inspect-lead" data-testid="landing-compare-without-lead">
                There is no clear way to hold people accountable.
            </p>
            <div className="landing-inspect-search">
                <Search size={16} />
                <span>Q3 forecast — expected Friday</span>
            </div>
            <ul className="landing-chase-list landing-chase-list--film">
                {CHASE_LINES.map((line, i) => (
                    <InspectPing key={line} line={line} index={i} progress={progress} />
                ))}
            </ul>
        </article>
    );
}

function InspectPing({ line, index, progress }) {
    const at = 0.03 + index * 0.05;
    const opacity = useTransform(progress, [at, at + 0.06], [0, 1]);
    const x = useTransform(progress, [at, at + 0.07], [-16, 0]);
    return (
        <motion.li style={{ opacity, x }}>
            <LandingFace who="alex" size={28} radius={8} />
            {line}
        </motion.li>
    );
}

function ReportCard({ progress }) {
    return (
        <article className="landing-report-card" data-testid="landing-report-card">
            <header>
                <FileText size={16} />
                <span>Weekly miss report</span>
            </header>
            <ul>
                {REPORT_ROWS.map((row, i) => (
                    <ReportRow key={row.who} row={row} index={i} progress={progress} />
                ))}
            </ul>
        </article>
    );
}

function ReportRow({ row, index, progress }) {
    const at = 0.22 + index * 0.04;
    const opacity = useTransform(progress, [at, at + 0.05], [0, 1]);
    const x = useTransform(progress, [at, at + 0.06], [18, 0]);
    const person = CAST[row.who];
    return (
        <motion.li style={{ opacity, x }} data-testid={`landing-report-${row.who}`}>
            <LandingCastMark who={row.who} size="sm" />
            <span>{person.short}</span>
            <b>{row.item}</b>
            <em className={row.state === 'Done' ? 'is-ok' : 'is-miss'}>{row.state}</em>
        </motion.li>
    );
}

function PeopleCard() {
    return (
        <article className="landing-perf-card">
            <p className="landing-compare-label">Team performance</p>
            <ul className="landing-perf-list" data-testid="landing-compare-perf">
                {PERF.map((row) => {
                    const person = CAST[row.who];
                    return (
                        <li key={row.who} data-testid={`landing-perf-${row.who}`} className={row.score < 50 ? 'is-flag' : ''}>
                            <LandingFace who={row.who} size={32} radius={999} />
                            <span className="landing-perf-who">
                                <b>{person.name}</b>
                                <span>{row.done}/{row.assigned} done</span>
                            </span>
                            <AccountabilityScore
                                score={row.score}
                                label={row.label}
                                size="sm"
                                testId={`landing-perf-score-${row.who}`}
                            />
                        </li>
                    );
                })}
            </ul>
        </article>
    );
}

function TalkCard() {
    return (
        <div className="gmeet gmeet--film gmeet--talk" data-testid="landing-talk-frame" aria-label="Google Meet">
            <header className="gmeet-top">
                <span className="gmeet-title">1:1 · Follow-through</span>
                <LandingCastMark who="alex" size="sm" />
                <span className="gmeet-time">Fri 4:52 PM</span>
            </header>
            <div className="gmeet-grid gmeet-grid--two">
                <div className="gmeet-tile is-you">
                    <LandingFace who="alex" size={220} radius={0} />
                    <span className="gmeet-name"><Mic size={12} /> Alex (You)</span>
                </div>
                <div className="gmeet-tile is-speaking">
                    <LandingFace who="maya" size={220} radius={0} />
                    <span className="gmeet-name"><Mic size={12} /> Maya</span>
                </div>
            </div>
            <p className="gmeet-cc">{CAST.alex.name}: This is the third Friday.</p>
        </div>
    );
}

function FileCard({ progress }) {
    return (
        <article className="landing-hr-file" data-testid="landing-compare-file">
            <p className="landing-compare-label">If someone is a problem</p>
            <p className="landing-compare-file-lead">
                You start documenting. Record meetings. Pull Slack. Build a file.
            </p>
            <ul>
                {FILE_STEPS.map((step, i) => (
                    <FileStep key={step} step={step} index={i} progress={progress} />
                ))}
            </ul>
        </article>
    );
}

function FileStep({ step, index, progress }) {
    const at = 0.78 + index * 0.04;
    const opacity = useTransform(progress, [at, at + 0.05], [0.35, 1]);
    const x = useTransform(progress, [at, at + 0.05], [10, 0]);
    return (
        <motion.li style={{ opacity, x }}>{step}</motion.li>
    );
}

function FlowScene({ progress }) {
    const joinOp = useTransform(progress, [0, 0.05, 0.22, 0.30], [1, 1, 1, 0]);
    const tasksOp = useTransform(progress, [0.26, 0.34, 0.46, 0.54], [0, 1, 1, 0]);
    const appOp = useTransform(progress, [0.50, 0.58, 0.68, 0.76], [0, 1, 1, 0]);
    const chaseOp = useTransform(progress, [0.72, 0.82, 1], [0, 1, 1]);
    const peaceOp = useTransform(progress, [0.86, 0.94], [0, 1]);

    return (
        <div className="landing-flow-act" data-testid="landing-flow-frame">
            <motion.div className="landing-film-layer" style={{ opacity: joinOp }} data-testid="landing-flow-join">
                <JoinMeet progress={progress} />
            </motion.div>
            <motion.div className="landing-film-layer" style={{ opacity: tasksOp }} data-testid="landing-flow-tasks">
                <TaskFlyout progress={progress} />
            </motion.div>
            <motion.div className="landing-film-layer" style={{ opacity: appOp }}>
                <AppCard progress={progress} />
            </motion.div>
            <motion.div className="landing-film-layer" style={{ opacity: chaseOp }} data-testid="landing-flow-chase">
                <TskChase progress={progress} peaceOp={peaceOp} />
            </motion.div>
        </div>
    );
}

function JoinMeet({ progress }) {
    const botOp = useTransform(progress, [0.06, 0.16], [0, 1]);
    const botY = useTransform(progress, [0.06, 0.18], [24, 0]);
    const noteOp = useTransform(progress, [0.10, 0.18], [0, 1]);

    return (
        <div className="gmeet gmeet--film" data-testid="landing-flow-meet" aria-label="Google Meet">
            <header className="gmeet-top">
                <span className="gmeet-title">Q3 pipeline</span>
                <motion.span className="landing-bot-chip" style={{ opacity: noteOp }} data-testid="landing-flow-joined">
                    <TskFlowMark size={16} />
                    TskFlow joined
                </motion.span>
                <span className="gmeet-time">3:11 PM</span>
            </header>
            <div className="gmeet-grid">
                {MEET_PEOPLE.map((tile) => (
                    <div key={tile.who} className={`gmeet-tile${tile.you ? ' is-you' : ''}`}>
                        <LandingFace who={tile.who} size={220} radius={0} />
                        <span className="gmeet-name">
                            <Mic size={12} />
                            {CAST[tile.who].short}
                            {tile.you ? ' (You)' : ''}
                        </span>
                        {tile.agree ? <span className="landing-meet-react" aria-hidden>{tile.agree}</span> : null}
                    </div>
                ))}
            </div>
            <motion.div className="landing-bot-tile" style={{ opacity: botOp, y: botY }} data-testid="landing-flow-bot">
                <TskFlowMark size={36} />
                <span>TskFlow is taking the tasks.</span>
            </motion.div>
        </div>
    );
}

function TaskFlyout({ progress }) {
    return (
        <div className="landing-flyout" data-testid="landing-flow-flyout">
            <p className="landing-flyout-kicker">Left the meet with</p>
            {TASKS.slice(0, 3).map((task, i) => (
                <FlyTask key={task.id} task={task} index={i} progress={progress} />
            ))}
        </div>
    );
}

function FlyTask({ task, index, progress }) {
    const at = 0.30 + index * 0.05;
    const opacity = useTransform(progress, [at, at + 0.06], [0, 1]);
    const y = useTransform(progress, [at, at + 0.07], [28 - index * 6, index * 8]);
    const rotate = useTransform(progress, [at, at + 0.07], [index % 2 === 0 ? -8 : 7, index % 2 === 0 ? -2 : 2]);
    return (
        <motion.article
            className={`landing-story-task landing-story-task--${task.tone} landing-fly-task`}
            style={{ opacity, y, rotate, zIndex: 4 - index }}
            data-testid={`landing-flow-task-${task.id}`}
        >
            <div className="landing-story-task-row">
                <LandingCastMark who={task.who} size="sm" />
                <span className="landing-story-task-title">{task.title}</span>
            </div>
            {task.due ? <span className="landing-clockchip landing-clockchip--sm">{task.due}</span> : null}
        </motion.article>
    );
}

function AppCard({ progress }) {
    const rx1 = useTransform(progress, [0.54, 0.60], [0, 1]);
    const rx2 = useTransform(progress, [0.58, 0.64], [0, 1]);
    const rx3 = useTransform(progress, [0.62, 0.68], [0, 1]);
    return <ProductCard rx1={rx1} rx2={rx2} rx3={rx3} />;
}

function ProductCard({ rx1, rx2, rx3 }) {

    return (
        <article className="landing-app" data-testid="landing-app-card">
            <header className="landing-app-head">
                <span>Q3 forecast</span>
                <span className="landing-clockchip">Friday</span>
            </header>
            <div className="landing-app-pills">
                <span><Sparkles size={12} /> AI Summary</span>
                <span><Mail size={12} /> Email Assignee</span>
            </div>
            <div className="landing-app-tabs">
                <span className="is-on"><MessageSquare size={13} /> Chatter (3)</span>
                <span><Bell size={13} /> Reminders (2)</span>
            </div>
            <div className="landing-app-chat" data-testid="landing-app-chatter">
                <p>
                    <LandingFace who="maya" size={22} radius={999} />
                    <span>Yep, I&apos;ll have this done by Friday.</span>
                    <motion.em style={{ opacity: rx1 }}>✅</motion.em>
                    <motion.em style={{ opacity: rx2 }}>👍</motion.em>
                </p>
                <p>
                    <TskFlowMark size={18} />
                    <span>Captured from the meet. I&apos;ll follow up if this goes quiet.</span>
                    <motion.em style={{ opacity: rx3 }}>👀</motion.em>
                </p>
            </div>
            <div className="landing-app-assigned" data-testid="landing-app-assigned">
                <Users size={16} />
                <span>Assigned to</span>
                <LandingFace who="maya" size={28} radius={999} />
                <b>{CAST.maya.name}</b>
            </div>
        </article>
    );
}

function TskChase({ progress, peaceOp }) {
    const mailOp = useTransform(progress, [0.74, 0.82], [0, 1]);
    const slackOp = useTransform(progress, [0.80, 0.88], [0, 1]);

    return (
        <div className="landing-flow-end">
            <motion.article className="gmail gmail--film" style={{ opacity: mailOp }} data-testid="landing-lived-gmail" aria-label="Gmail">
                <header className="gmail-top">
                    <span className="gmail-word">Gmail</span>
                    <span className="gmail-search">Search mail</span>
                </header>
                <article className="gmail-read">
                    <h3>Q3 forecast</h3>
                    <div className="gmail-tools" aria-hidden>
                        <Archive size={16} />
                        <Trash2 size={16} />
                        <Clock size={16} />
                    </div>
                    <div className="gmail-from">
                        <TskFlowMark size={28} />
                        <div>
                            <p><b>TskFlow</b> <span>&lt;tasks@tskflow.com&gt;</span></p>
                            <p>to {CAST.maya.short}</p>
                        </div>
                    </div>
                    <p className="gmail-text" data-testid="landing-gmail-body">
                        Still on the Q3 forecast for Friday.
                    </p>
                </article>
            </motion.article>
            <motion.article className="landing-slack landing-slack--film" style={{ opacity: slackOp }} data-testid="landing-lived-slack">
                <div className="landing-slack-head">
                    <TskFlowMark size={22} />
                    <span className="landing-slack-name">TskFlow</span>
                    <span className="landing-slack-time">Fri</span>
                </div>
                <p className="landing-slack-body">Maya — the Q3 forecast is still open.</p>
                <p className="sr-only"># q3-forecast</p>
            </motion.article>
            <motion.div className="landing-peace-strip" style={{ opacity: peaceOp }} data-testid="landing-flow-peace">
                {FLOW_STEPS.map((step) => (
                    <span key={step}>{step}</span>
                ))}
                <p data-testid="landing-compare-calm">
                    Leaders see who follows through. HR already has the record.
                </p>
            </motion.div>
        </div>
    );
}
