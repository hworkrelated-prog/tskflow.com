/** ChatGPT-style voice routing: pages, commands, and when to chat vs compose a task. */

export const VOICE_ROUTES = {
    dashboard: '/dashboard',
    home: '/dashboard',
    hub: '/dashboard',
    analytics: '/analytics',
    metrics: '/analytics',
    reports: '/analytics',
    report: '/analytics',
    team: '/team',
    settings: '/settings',
    preferences: '/settings',
    leads: '/leads',
    lead: '/leads',
    help: '/help',
    recordings: '/recordings',
    recording: '/recordings',
    recurring: '/recurring',
    transcript: '/transcript',
    activity: '/activity',
    unbiassly: '/unbiassly',
    calendar: '/connect-calendar',
    leaderboard: '/leaderboard',
    updates: '/updates',
};

export const routeForVoiceTarget = (target) => VOICE_ROUTES[String(target || '').toLowerCase().trim()] || null;

const TASK_COMPOSE_RE = /\b(ask|tell|assign|remind(?:\s+me)?|create (?:a )?task|i (?:need|have|got) to|please (?:have|ask)|follow up with|send .+ to)\b/i;
const QUESTION_RE = /^(how|what|where|why|when|who|can (?:i|you|we)|could you|do you|is there|does|are there)\b/i;
const CHAT_OPENER_RE = /^(hi|hello|hey|yo|sup|thanks|thank you|thx)[\s!.]*$/i;
const COMMAND_OPENER_RE = /^(go to|open|show|take me to|jump to|search|find|look up|\/)/i;

/** Assign / remind / create language belongs in the confirm-before-send composer. */
export function shouldComposeTask(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (COMMAND_OPENER_RE.test(t) || CHAT_OPENER_RE.test(t)) return false;
    if (/^(how|what|where|why|who|do you|is there|does|are there)\b/i.test(t)) return false;
    if (/\brecurring\b/i.test(t) && !/\b(ask|assign|remind)\b/i.test(t)) return false;
    return TASK_COMPOSE_RE.test(t);
}

/** Questions, navigation, search, and small talk stay in the voice chat. */
export function shouldVoiceChat(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (shouldComposeTask(t)) return false;
    if (QUESTION_RE.test(t) || /\?$/.test(t)) return true;
    if (COMMAND_OPENER_RE.test(t) || CHAT_OPENER_RE.test(t)) return true;
    if (/\b(what can you do|who are you|help me|how do i|tell me about)\b/i.test(t)) return true;
    return true;
}

export function applyVoiceAction(action, handlers = {}) {
    const type = action?.type;
    const params = action?.params || {};
    if (!type || type === 'none' || type === 'assistant_answer') return { handled: type === 'assistant_answer' };

    if (type === 'navigate') {
        const route = routeForVoiceTarget(params.target);
        if (route && handlers.navigate) {
            const wait = handlers.delay ?? 400;
            if (wait <= 0) handlers.navigate(route);
            else setTimeout(() => handlers.navigate(route), wait);
            return { handled: true, route };
        }
        return { handled: false };
    }
    if (type === 'search' && params.query) {
        const q = String(params.query).trim();
        if (q && handlers.navigate) {
            handlers.navigate(`/dashboard?q=${encodeURIComponent(q)}`);
            return { handled: true, query: q };
        }
        return { handled: false };
    }
    if (type === 'start_recording') {
        handlers.startRecording?.();
        return { handled: true };
    }
    if (type === 'start_recurring') {
        handlers.startRecurring?.();
        return { handled: true };
    }
    if (type === 'open_form') {
        handlers.openForm?.();
        return { handled: true };
    }
    if (['create_task', 'assign_task', 'update_status', 'query_outstanding', 'query_sheet_metrics'].includes(type)) {
        if (handlers.onExecuted) handlers.onExecuted(action, handlers.executed);
        return { handled: true };
    }
    return { handled: false };
}
