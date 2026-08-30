/** Spoken replies use OpenAI Nova TTS (ChatGPT's public voice). Browser synth is fallback. */

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

let currentAudio = null;
let currentUrl = null;
let speakGen = 0;

// Tiny silent wav so play() stays unlocked after the TTS fetch.
const SILENCE_WAV =
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export const cleanSpeechText = (text) =>
    String(text || '')
        .replace(/[•●▪︎]/g, '')
        .replace(/\*\*?/g, '')
        .replace(/[_#`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

export const pickChatGptLikeVoice = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const rank = (v) => {
        const n = `${v.name} ${v.lang}`.toLowerCase();
        let score = 0;
        if (/en(-|_)?(us|gb|au)/i.test(v.lang)) score += 12;
        if (/samantha|aria|jenny|nova|natural|neural|premium|enhanced|google us english|microsoft aria/i.test(n)) score += 14;
        if (/google|microsoft|apple/i.test(n)) score += 6;
        if (/female|samantha|karen|moira|tessa|victoria/i.test(n)) score += 4;
        if (/compact|espeak|robot|zarvox|trinoids/i.test(n)) score -= 16;
        return score;
    };
    return [...voices].sort((a, b) => rank(b) - rank(a))[0] || null;
};

export const stopChatGptVoice = () => {
    speakGen += 1;
    if (currentAudio) {
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.onplay = null;
        try {
            currentAudio.pause();
        } catch {
            /* ignore */
        }
        currentAudio.src = '';
        currentAudio = null;
    }
    if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        currentUrl = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};

const speakBrowserFallback = (text, { onEnd, onError } = {}) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
        onError?.();
        return;
    }
    const u = new window.SpeechSynthesisUtterance(text);
    const voice = pickChatGptLikeVoice();
    if (voice) u.voice = voice;
    u.rate = 0.96;
    u.pitch = 1.04;
    u.volume = 1;
    u.onend = () => onEnd?.();
    u.onerror = () => onError?.();
    window.speechSynthesis.speak(u);
};

/**
 * Play text in ChatGPT's Nova voice via /voice/speak. Falls back to the best
 * local neural voice if the API is missing or fails.
 */
export const speakChatGptVoice = async (text, hooks = {}) => {
    const cleaned = cleanSpeechText(text);
    const { onStart, onEnd, onError } = hooks;
    stopChatGptVoice();
    const gen = speakGen;
    const stillCurrent = () => gen === speakGen;
    if (!cleaned) {
        onError?.();
        return;
    }
    onStart?.();

    const audio = typeof Audio === 'function' ? new Audio() : null;
    currentAudio = audio;
    if (audio) {
        try {
            audio.src = SILENCE_WAV;
            await audio.play();
            audio.pause();
            audio.currentTime = 0;
        } catch {
            /* autoplay unlock is best-effort */
        }
    }
    if (!stillCurrent()) return;

    try {
        const headers = { 'Content-Type': 'application/json' };
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '';
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API}/voice/speak`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ text: cleaned }),
        });
        if (!stillCurrent()) return;
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const blob = await res.blob();
        if (!stillCurrent()) return;
        if (!blob || blob.size < 80) throw new Error('empty tts');
        if (!audio) throw new Error('no audio element');
        const url = URL.createObjectURL(blob);
        currentUrl = url;
        audio.src = url;
        audio.onended = () => {
            if (!stillCurrent()) return;
            stopChatGptVoice();
            onEnd?.();
        };
        audio.onerror = () => {
            if (!stillCurrent()) return;
            speakBrowserFallback(cleaned, { onEnd, onError });
        };
        await audio.play();
    } catch {
        if (!stillCurrent()) return;
        speakBrowserFallback(cleaned, { onEnd, onError });
    }
};
