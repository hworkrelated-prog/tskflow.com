/** Combine typed seed + spoken words for the AI prompt. */
export function composeVoiceSubmit(seed, spoken) {
    return [seed, spoken]
        .map((part) => (part || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
}

/** Voice auto-sends only when the user actually said something. */
export function shouldAutoSendVoice(spoken) {
    return (spoken || '').trim().length >= 2;
}
