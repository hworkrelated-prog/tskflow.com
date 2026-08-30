/** Common AI-bar commands shown as a rotating placeholder. */
export const PROMPT_EXAMPLES = [
    'Ask my managers to review SFDC hygiene by noon tomorrow',
    'Ask everyone under me to update their opportunities by Friday 5pm',
    'Assign Maya the Q3 recap by Friday 5pm',
    'What’s outstanding?',
    'Remind Jordan to send the client deck tomorrow',
    'Go to analytics',
];

export const PROMPT_EXAMPLE_INTERVAL_MS = 4000;

export const nextPromptExampleIndex = (current, total = PROMPT_EXAMPLES.length) => {
    if (!total) return 0;
    return ((current ?? 0) + 1) % total;
};
