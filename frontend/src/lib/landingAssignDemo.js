/** Scripted landing demo: one sentence → ~36 people → rollup → Slack thread. */

export const DEMO_PROMPT = 'Assign East Coast sales to send the Q3 outreach email by EOD.';

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
            text: "Hey Chris — Maya asked you to send the Q3 outreach email. It's due EOD. I've pinged you twice in TskFlow with no response, so I'm checking in here instead of making her chase you. Can you take this, or should I tell her you're blocked?",
        },
        {
            role: 'user',
            name: 'Chris Park',
            text: 'On it after standup.',
        },
        {
            role: 'assistant',
            name: 'Jarvis',
            text: "Perfect — you're on it. I marked you accepted. I'll stay out of your way unless this slips.",
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
