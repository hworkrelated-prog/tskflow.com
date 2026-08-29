/**
 * Anonymous funnel events for the landing page and the guest robot room.
 * No emails, no names - just which step the visitor reached.
 */
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;
const SESSION_KEY = 'tsk_session_id';
const ONCE_PREFIX = 'tsk_evt_once_';

export const sessionId = () => {
    try {
        const existing = sessionStorage.getItem(SESSION_KEY);
        if (existing) return existing;
        const fresh = `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        sessionStorage.setItem(SESSION_KEY, fresh);
        return fresh;
    } catch {
        return null;
    }
};

/** Fire and forget - analytics must never block or break the page. */
export const trackEvent = (event, meta) => {
    if (!event) return Promise.resolve(false);
    const payload = { event, session_id: sessionId(), meta: meta || undefined };
    return axios
        .post(`${API}/analytics/event`, payload, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
};

/** Once per browser session (landing views must not double count on re-render). */
export const trackEventOnce = (event, meta) => {
    try {
        const key = `${ONCE_PREFIX}${event}`;
        if (sessionStorage.getItem(key)) return Promise.resolve(false);
        sessionStorage.setItem(key, '1');
    } catch {
        /* private mode - still send it once per mount */
    }
    return trackEvent(event, meta);
};

export const trackLandingView = (meta) => trackEventOnce('landing_view', meta);

/** Typed, used the sample, or started a recording - one per session is enough. */
export const trackLandingInteract = (kind) => trackEventOnce('landing_interact', { kind });

export const trackRecordingStart = (meta) => trackEvent('recording_start', meta);

export const trackEnvView = (meta) => trackEvent('env_view', meta);
