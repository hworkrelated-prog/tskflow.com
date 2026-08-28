import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export const CALENDAR_OAUTH_NEXT_KEY = 'tskflow_calendar_oauth_next';
export const CALENDAR_OAUTH_ALLOWED_NEXT = ['/dashboard', '/settings'];

export function safeCalendarOAuthNext(raw) {
    let path = String(raw || '').trim() || '/dashboard';
    if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
        return '/dashboard';
    }
    if (path.includes('://') || path.includes('\\')) {
        return '/dashboard';
    }
    path = path.split('?')[0].split('#')[0];
    return CALENDAR_OAUTH_ALLOWED_NEXT.includes(path) ? path : '/dashboard';
}

export function shouldConnectCalendarOnSignup(user) {
    if (!user) return false;
    const tier = String(user.subscription_tier || '').toLowerCase();
    if (tier !== 'teams') return false;
    return !user.google_calendar_connected;
}

export function rememberCalendarOAuthNext(next) {
    try {
        sessionStorage.setItem(CALENDAR_OAUTH_NEXT_KEY, safeCalendarOAuthNext(next));
    } catch {
        /* noop */
    }
}

export function peekCalendarOAuthNext(fallback = '/settings') {
    try {
        const stored = sessionStorage.getItem(CALENDAR_OAUTH_NEXT_KEY);
        if (!stored) return safeCalendarOAuthNext(fallback);
        return safeCalendarOAuthNext(stored);
    } catch {
        return safeCalendarOAuthNext(fallback);
    }
}

export async function startGoogleCalendarConnect({ next = '/dashboard' } = {}) {
    const dest = safeCalendarOAuthNext(next);
    rememberCalendarOAuthNext(dest);
    const { data } = await axios.get(`${API}/auth/google/connect`, {
        params: { next: dest },
        withCredentials: true,
    });
    if (data?.already_connected) return { already_connected: true };
    if (!data?.auth_url) throw new Error('Could not start Google Calendar connection');
    window.location.assign(data.auth_url);
    return { redirected: true };
}
