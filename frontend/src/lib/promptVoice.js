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

export function createSpeechRecognition() {
    const SR = typeof window !== 'undefined'
        ? (window.SpeechRecognition || window.webkitSpeechRecognition)
        : null;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = true;
    return rec;
}

/**
 * One dictation session used by the prompt mic and Jarvis voice, so both
 * listen / settle / commit the same way.
 */
export function createDictationSession({
    createRecognition = createSpeechRecognition,
    getDisplayed,
    getSeed,
    onTranscript,
    utteranceMs = VOICE_UTTERANCE_MS,
    silenceMs = VOICE_SILENCE_MS,
} = {}) {
    let rec = null;
    let want = false;
    let heard = '';
    let seed = '';
    let restartTimer = null;
    let silence = null;
    let utterance = null;
    let onCommit = null;
    let onError = null;

    const payload = () => resolveVoiceSubmit({
        seed,
        spoken: heard,
        displayed: getDisplayed?.() || '',
    });

    const stop = ({ commit = false } = {}) => {
        want = false;
        if (restartTimer) {
            clearTimeout(restartTimer);
            restartTimer = null;
        }
        silence?.clear();
        silence = null;
        utterance?.clear();
        utterance = null;
        const current = rec;
        rec = null;
        tearDownSpeechRecognition(current);
        const text = payload();
        const shouldCommit = commit && text;
        heard = '';
        if (shouldCommit) onCommit?.(text);
        return text;
    };

    const start = (opts = {}) => {
        onCommit = opts.onCommit || null;
        onError = opts.onError || null;
        const next = createRecognition?.();
        if (!next) return { started: false, reason: 'unsupported' };
        stop({ commit: false });
        rec = next;
        seed = String(getSeed?.() || '').trim();
        heard = '';
        want = true;

        silence = createSilenceWatch({
            ms: silenceMs,
            onSilence: () => stop({ commit: true }),
        });
        utterance = createSilenceWatch({
            ms: utteranceMs,
            onSilence: () => {
                if (shouldAutoSendVoice(heard)) stop({ commit: true });
            },
        });
        silence.bump();

        next.onresult = (event) => {
            const { spoken } = collectRecognitionSpeech(event.results);
            onTranscript?.({
                spoken,
                seed,
                shown: composeVoiceSubmit(seed, spoken),
            });
            if (spoken && spoken !== heard) {
                heard = spoken;
                silence.clear();
                utterance.bump();
            }
        };
        next.onspeechend = () => {
            if (shouldAutoSendVoice(heard)) utterance.bump();
        };
        next.onerror = (event) => {
            const err = event?.error;
            if (err === 'no-speech' || err === 'aborted') return;
            onError?.(err);
            stop({ commit: false });
        };
        next.onend = () => {
            if (rec !== next || !want) {
                if (rec === next) stop({ commit: true });
                return;
            }
            if (restartTimer) clearTimeout(restartTimer);
            restartTimer = setTimeout(() => {
                restartTimer = null;
                if (!want || rec !== next) return;
                try {
                    next.start();
                } catch {
                    stop({ commit: true });
                }
            }, VOICE_RESTART_MS);
        };
        try {
            next.start();
            return { started: true };
        } catch {
            stop({ commit: false });
            return { started: false, reason: 'start-failed' };
        }
    };

    return {
        start,
        stop,
        get active() {
            return want;
        },
    };
}

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
