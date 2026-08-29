/** Scripted landing demo: one sentence → ~36 people → rollup → Slack thread. */

export const LANDING_EXAMPLES = [
    {
        id: 'pipeline',
        text: 'Tell my manager to send a pipeline update every day at 9.',
    },
    {
        id: 'walkthrough',
        text: 'Ask the org to watch this recording, then send theirs of them doing it.',
    },
    {
        id: 'best-deal',
        text: 'Ask the org to submit their best deal, with all the details.',
    },
    {
        id: 'forecast',
        text: 'Tell sales to send this week\'s forecast by Friday.',
    },
    {
        id: 'calls',
        text: 'Remind my team to log every call by 5 each day.',
    },
    {
        id: 'demo',
        text: 'Ask engineering to record a demo of the fix by tomorrow.',
    },
];

export const DEMO_PROMPT = LANDING_EXAMPLES[0].text;

export const DEMO_PEOPLE = [
    'Chris Park', 'Priya Shah', 'Jordan Hale', 'Elena Ruiz', 'Marcus Chen', 'Nina Patel',
    'Owen Brooks', 'Sam Okonkwo', 'Maya Chen', 'Alex Rivera', 'Taylor Brooks', 'Jamie Nguyen',
    'Riley Costa', 'Avery Kim', 'Quinn Patel', 'Casey Walsh', 'Drew Morales', 'Morgan Lee',
    'Dana Cole', 'Reese Alvarez', 'Skyler Bennett', 'Harper Singh', 'Logan Price', 'Rowan Blake',
    'Parker James', 'Finley Cruz', 'Hayden Brooks', 'Remy Shah', 'Jules Anton', 'Kai Moreno',
    'Noor Haddad', 'Blake Everett', 'Sasha Lin', 'Devon Clarke', 'Indira Rao', 'Leila Okada',
];

export const DEMO_ROLLUP = {
    delivered: DEMO_PEOPLE.length,
    received: DEMO_PEOPLE.length,
    accepted: 22,
    silent: 14,
    pingedTwice: [
        'Chris Park', 'Priya Shah', 'Jordan Hale', 'Elena Ruiz',
        'Marcus Chen', 'Nina Patel', 'Owen Brooks', 'Sam Okonkwo',
    ],
    slackThreads: 1,
};

export const DEMO_SLACK = {
    person: 'Chris Park',
    messages: [
        {
            role: 'assistant',
            name: 'Jarvis',
            text: "Hey Chris - Maya asked you to take this on. It's due EOD. I've pinged you twice in Tskflow with no response, so I'm checking in here instead of making her chase you. Can you take this, or should I tell her you're blocked?",
        },
        {
            role: 'user',
            name: 'Chris Park',
            text: 'On it after standup.',
        },
        {
            role: 'assistant',
            name: 'Jarvis',
            text: "Perfect - you're on it. I marked you accepted. I'll stay out of your way unless this slips.",
        },
    ],
    result: 'Chris accepted. Task updated from Slack.',
};

export const DEMO_BEATS = [
    { id: 'sentence', label: 'One sentence' },
    { id: 'assigned', label: '36 people' },
    { id: 'rollup', label: 'AI update' },
    { id: 'slack', label: 'Slack thread' },
];

export const isLargeTeamPrompt = (text) =>
    /\b(east coast|everyone|my team|sales team|\b3[0-9]\b|\b40\b)\b/i.test(String(text || ''));

const WHEN_TAIL =
    '(?:every day at \\d+|each day at \\d+|by 5 each day|by eod|by tomorrow|by friday|by monday|by tuesday|by wednesday|by thursday|by saturday|by sunday)';

const splitWhen = (rest) => {
    const m = String(rest || '').match(new RegExp(`^(.*?)(\\s+)(${WHEN_TAIL})([.!?]*)$`, 'i'));
    if (!m) {
        const punct = String(rest || '').match(/^(.*?)([.!?]+)$/);
        return punct
            ? { work: punct[1], when: '', punct: punct[2] }
            : { work: rest, when: '', punct: '' };
    }
    return { work: m[1], gap: m[2], when: m[3], punct: m[4] || '' };
};

/**
 * Split an assign-style sentence into color-coded parts for the landing try-it UI.
 * kind: who (assignee/group) | work (the ask) | when (deadline) | plain
 */
export const colorizeAssignPrompt = (raw) => {
    const text = String(raw || '');
    if (!text) return [];

    const assign = text.match(/^(assign\s+)(.+?)(\s+to\s+)(.+?)(\s+by\s+)(.+?)([.!?]*)$/i);
    if (assign) {
        return [
            { kind: 'plain', text: assign[1] },
            { kind: 'who', text: assign[2] },
            { kind: 'plain', text: assign[3] },
            { kind: 'work', text: assign[4] },
            { kind: 'plain', text: assign[5] },
            { kind: 'when', text: assign[6] },
            ...(assign[7] ? [{ kind: 'plain', text: assign[7] }] : []),
        ];
    }

    const lead = text.match(/^(tell|ask|remind)\s+(.+?)\s+to\s+(.+)$/i);
    if (lead) {
        const { work, gap, when, punct } = splitWhen(lead[3]);
        return [
            { kind: 'plain', text: `${lead[1]} ` },
            { kind: 'who', text: lead[2] },
            { kind: 'plain', text: ' to ' },
            { kind: 'work', text: work },
            ...(when ? [{ kind: 'plain', text: gap || ' ' }, { kind: 'when', text: when }] : []),
            ...(punct ? [{ kind: 'plain', text: punct }] : []),
        ];
    }

    const byWhen = text.match(/^(.*?)(\s+by\s+)(eod|eod\.|end of day|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday)([.!?]*)$/i);
    if (byWhen) {
        return [
            { kind: 'work', text: byWhen[1] },
            { kind: 'plain', text: byWhen[2] },
            { kind: 'when', text: byWhen[3] },
            ...(byWhen[4] ? [{ kind: 'plain', text: byWhen[4] }] : []),
        ];
    }

    return [{ kind: 'plain', text }];
};

export const PROMPT_SEGMENT_CLASS = {
    plain: 'text-white/55',
    who: 'text-teal-300 font-medium',
    work: 'text-sky-200',
    when: 'text-amber-300 font-medium',
};
