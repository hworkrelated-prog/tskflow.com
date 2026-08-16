/** First-person / "remind me" detection + last-assignee session memory. */

export const LAST_ASSIGNEES_KEY = 'tskflow_ai_last_assignees';

export const SELF_CHIP = { kind: 'user', id: 'self', name: 'Me' };

const TEAM_PHRASE_RE = /\b(?:my|our|the)\s+team\b|\bmy\s+(?:direct\s+)?reports\b|\beveryone under me\b/i;
const SELF_REMIND_RE = /\b(?:remind|nudge|ping|notify)\s+me\b/i;
const SELF_ASSIGN_TO_RE = /\bassign(?:ed)?(?:\s+\w+){0,4}\s+to\s+(?:me|myself)\b/i;
const SELF_TASK_FOR_RE = /\b(?:a\s+)?(?:task|reminder|todo|note)\s+for\s+(?:me|myself)\b/i;
const SELF_FIRST_PERSON_RE = /\bi(?:'m\s+going\s+to|'ll|\s+will|\s+need\s+to|\s+have\s+to|\s+gotta|\s+got\s+to|\s+should|\s+must|\s+want\s+to)\b/i;
const DELIVER_TO_ME_RE = /\b(?:send|give|email|forward|cc|show|tell|share|text)\s+me\b/i;
const NAMED_PERSON_RE = /\b(?:have|ask|tell|get|assign(?:ed)?(?:\s+to)?)\s+[A-Z][A-Za-z'.-]+/;

export function promptNamesSomeoneElse(text) {
    const t = (text || '').trim();
    if (!t) return false;
    if (TEAM_PHRASE_RE.test(t)) return true;
    if (/@[A-Za-z]/.test(t) && !/(^|\s)@me\b/i.test(t)) return true;
    if (NAMED_PERSON_RE.test(t)) return true;
    return false;
}

export function promptMeansSelfAssign(text) {
    const t = (text || '').trim();
    if (!t || promptNamesSomeoneElse(t)) return false;
    if (SELF_REMIND_RE.test(t) || /(^|\s)@me\b/i.test(t)) return true;
    if (SELF_ASSIGN_TO_RE.test(t) || SELF_TASK_FOR_RE.test(t)) return true;
    if (/\bfor myself\b|\bto myself\b/i.test(t)) return true;
    if (/\b(1\s*:\s*1|one[\s-]?on[\s-]?one|one[\s-]?to[\s-]?one)\b/i.test(t)) return true;
    if (DELIVER_TO_ME_RE.test(t) && !SELF_FIRST_PERSON_RE.test(t)) return false;
    if (SELF_FIRST_PERSON_RE.test(t)) return true;
    return false;
}

export function readLastAssignees() {
    try {
        const raw = sessionStorage.getItem(LAST_ASSIGNEES_KEY);
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((a) => a && (a.id || a.email || a.name)) : [];
    } catch {
        return [];
    }
}

export function writeLastAssignees(chips) {
    try {
        const clean = (chips || [])
            .filter((a) => a && (a.id || a.email || a.name))
            .map((a) => ({
                kind: a.kind || 'user',
                id: a.id,
                name: a.name,
                email: a.email,
                members: a.members,
                emails: a.emails,
                member_count: a.member_count,
            }));
        if (clean.length) sessionStorage.setItem(LAST_ASSIGNEES_KEY, JSON.stringify(clean));
        else sessionStorage.removeItem(LAST_ASSIGNEES_KEY);
    } catch {
        /* private mode / quota */
    }
}

export function rememberedAssigneesForPrompt(text) {
    if (promptMeansSelfAssign(text) || promptNamesSomeoneElse(text)) return [];
    return readLastAssignees();
}
