/** Common AI-bar commands shown as a rotating placeholder. */
export const PROMPT_EXAMPLES = [
    'Tell my team to complete the outreach training by 12',
    'Assign Maya the Q3 recap by Friday 5pm',
    'What’s outstanding?',
    'Go to analytics',
    'Search follow-ups from last week',
    'Remind Jordan to send the client deck tomorrow',
    'From transcript',
    'Nudge everyone who hasn’t accepted',
];

export const PROMPT_EXAMPLE_INTERVAL_MS = 4000;

export const nextPromptExampleIndex = (current, total = PROMPT_EXAMPLES.length) => {
    if (!total) return 0;
    return ((current ?? 0) + 1) % total;
};
