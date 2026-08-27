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

/**
 * Contemplative pauses should not kill the mic. Browsers end a non-continuous
 * recognition session after ~1–3s of quiet; we keep listening and only stop
 * after this much silence (middle of the 15–30s product range).
 */
export const VOICE_SILENCE_MS = 20_000;

export const VOICE_RESTART_MS = 280;

/**
 * Drop SpeechRecognition without leaving the tab-level mic indicator on.
 * Null handlers first so `onend` cannot immediately `start()` again (Safari/iOS).
 */
export function tearDownSpeechRecognition(rec) {
    if (!rec) return;
    try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.onnomatch = null;
        rec.onsoundend = null;
        rec.onspeechend = null;
    } catch {
        /* noop */
    }
    try { rec.abort(); } catch { /* noop */ }
    try { rec.stop(); } catch { /* noop */ }
}

/** Resettable silence timer used while voice mode is armed. */
export function createSilenceWatch({ ms = VOICE_SILENCE_MS, onSilence } = {}) {
    let timer = null;
    const clear = () => {
        if (timer != null) {
            clearTimeout(timer);
            timer = null;
        }
    };
    return {
        /** Arm / re-arm the silence countdown from "now". */
        bump() {
            clear();
            timer = setTimeout(() => {
                timer = null;
                onSilence?.();
            }, ms);
        },
        clear,
        get active() {
            return timer != null;
        },
    };
}
