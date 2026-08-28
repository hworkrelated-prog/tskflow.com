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
 * Safari/iOS often never marks SpeechRecognition results as final, so the
 * live transcript lives in interim only. Always keep both.
 */
export function collectRecognitionSpeech(results) {
    let finalText = '';
    let interim = '';
    const list = results || [];
    for (let i = 0; i < list.length; i += 1) {
        const piece = String(list[i]?.[0]?.transcript || '').trim();
        if (!piece) continue;
        if (list[i].isFinal) {
            finalText = finalText ? `${finalText} ${piece}` : piece;
        } else {
            interim = interim ? `${interim} ${piece}` : piece;
        }
    }
    return {
        finalText,
        interim,
        spoken: composeVoiceSubmit(finalText, interim),
    };
}

/**
 * What to submit when the mic session ends. Prefer heard speech (final +
 * interim). Fall back to the on-screen prompt only when it is more than the
 * typed seed, so a silent hang-up does not auto-send leftover typing.
 */
export function resolveVoiceSubmit({ seed = '', spoken = '', displayed = '' } = {}) {
    const heard = String(spoken || '').trim();
    const seedTrim = String(seed || '').trim();
    if (shouldAutoSendVoice(heard)) {
        if (!seedTrim) return heard;
        if (heard.startsWith(seedTrim)) return heard;
        return composeVoiceSubmit(seedTrim, heard);
    }
    const shown = String(displayed || '').trim();
    if (shown && shown !== seedTrim && shouldAutoSendVoice(shown)) return shown;
    return '';
}

/** Hang up if they tap the mic and never speak. */
export const VOICE_SILENCE_MS = 20_000;

/**
 * After the live transcript stops changing, treat the utterance as done and
 * send. Duplicate iOS interims must not keep resetting this, or the prompt
 * stays in listening forever (red ring + orange mic pill).
 */
export const VOICE_UTTERANCE_MS = 1600;

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
