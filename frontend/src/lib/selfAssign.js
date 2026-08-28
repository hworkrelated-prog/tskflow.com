/** First-person / "remind me" detection + last-assignee session memory. */

export const LAST_ASSIGNEES_KEY = 'tskflow_ai_last_assignees';

export const SELF_CHIP = { kind: 'user', id: 'self', name: 'Me' };

const TEAM_PHRASE_RE = /\b(?:my|our|the)\s+team\b|\bmy\s+(?:direct\s+)?reports\b|\beveryone under me\b/i;
const SELF_REMIND_RE = /\b(?:remind|nudge|ping|notify)\s+me\b/i;
const SELF_ASSIGN_TO_RE = /\bassign(?:ed)?(?:\s+\w+){0,4}\s+to\s+(?:me|myself)\b/i;
const SELF_TASK_FOR_RE = /\b(?:a\s+)?(?:task|reminder|todo|note)\s+for\s+(?:me|myself)\b/i;
const SELF_FIRST_PERSON_RE = /\bi(?:'m\s+going\s+to|'ll|\s+will|\s+need\s+to|\s+have\s+to|\s+gotta|\s+got\s+to|\s+should|\s+must|\s+want\s+to)\b/i;
const DELIVER_TO_ME_RE = /\b(?:send|give|email|forward|cc|show|tell|share|text|shoot|get|draft|write)\s+me\b|\b(?:send|give|email|forward|share|draft|write|shoot)\b(?:\s+\S+){0,10}\s+(?:with|to)\s+me\b|\b(?:share|send|email|draft|write)\b(?:\s+\S+){0,10}\s+for\s+me\b/i;
const HAVE_NAME_RE = /\b(?:have|had|ask(?:ed)?|tell(?:s|ing)?|told|get|got|assign(?:ed)?(?:\s+to)?)\s+([A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*){0,2})\s+(?:to|go|do|review|send|look|check|update|through|that)/gi;
const TELL_PERSON_RE = /\b(?:make sure (?:to\s+)?|please\s+|kindly\s+|go (?:ahead and\s+)?(?:and\s+)?)?(?:tell|ask|inform|remind)\s+(?!me\b|my\b|the\b|our\b|them\b|him\b|her\b)([A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*){0,3})(?:\s+that)?(?:\s+(?:she|he|they))?\s+(?:needs|need|has|have|gotta|got to|should|must|will|to)\b/gi;
const ASKED_TO_NAME_RE = /\b(?:i(?:'ve| have|'d| had)?\s+)?(?:just\s+)?(?:please\s+)?(?:asked|told|ask|tell)\s+(?!me\b)([A-Za-z][A-Za-z']*)\s+to\b/gi;
const WANT_PERSON_TO_RE = /\bi\s+(?:want|need|would like)\s+(?!my\b|the\b|our\b|to\b|them\b)([A-Za-z][A-Za-z']*)\s+to\b/gi;
const HAVE_NAME_RUN_RE = /\b(?:have|had|get|got)\s+([A-Za-z][A-Za-z']*)\s+run\b/gi;
const OWNER_NEEDS_RE = /\b([A-Za-z][A-Za-z']*(?:\s+[A-Za-z][A-Za-z']*){0,2})\s+(?:needs to|has to|gotta|got to|should|must|will|is going to|is supposed to)\b/gi;
const NAME_STOP = new Set([
    'my', 'the', 'our', 'this', 'that', 'them', 'him', 'her', 'he', 'she', 'they',
    'we', 'you', 'i', 'me', 'us', 'it', 'a', 'an', 'your', 'their', 'someone',
    'anyone', 'everyone', 'anybody', 'somebody', 'nobody', 'who', 'what', 'when',
    'please', 'today', 'tomorrow', 'team', 'all', 'each', 'both', 'his', 'hers',
    'just', 'also', 'then', 'can',
]);
const NAME_TRAIL_STOP = new Set([
    ...NAME_STOP, 'to', 'go', 'do', 'run', 'give', 'share', 'send', 'through', 'and',
    'that', 'needs', 'need', 'has', 'have', 'should', 'must', 'will',
]);
const TIMEISH_RE = /^(?:(?:due|by|at|before|until)\s+)?(?:asap|eod|eom|now|immediately|urgent|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|end of (?:the )?day|end of (?:the )?month|\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*(?:pst|pdt|pt|est|edt|et|cst|mst|utc|gmt))?|in\s+\d+\s*(?:min|mins|minutes|hours?|days?|weeks?))$/i;

function cleanNameHint(name) {
    const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
    while (tokens.length && NAME_STOP.has(tokens[0].toLowerCase().replace(/[.,;:]+$/g, ''))) tokens.shift();
    while (tokens.length && NAME_TRAIL_STOP.has(tokens[tokens.length - 1].toLowerCase().replace(/[.,;:]+$/g, ''))) tokens.pop();
    const first = (tokens[0] || '').toLowerCase().replace(/[.,;:]+$/g, '');
    if (!tokens.length || NAME_STOP.has(first) || first.length < 2) return '';
    const deduped = [];
    tokens.forEach((tok) => {
        if (!deduped.length || deduped[deduped.length - 1].toLowerCase() !== tok.toLowerCase()) {
            deduped.push(tok);
        }
    });
    return deduped.join(' ');
}

/** Undo dictation glue: sheNeeds → she Needs, sendPictures → send Pictures. */
export function repairMessyPrompt(text) {
    let s = String(text || '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Za-z])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-z])/g, '$1 $2')
        .replace(/\bof\s+via\b/gi, 'via');
    for (const word of ['That', 'This', 'She', 'He', 'They', 'Needs', 'Need', 'Has', 'Have', 'Will', 'Must', 'Should', 'The', 'And', 'Of', 'To', 'For']) {
        s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), word.toLowerCase());
    }
    return s.replace(/\s+/g, ' ').trim();
}

export function looksLikeTimeOnly(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (TIMEISH_RE.test(t)) return true;
    return /^(?:(?:due|by|at|before|until)\s+)?\d{1,2}(?::\d{2})?\s*(?:o'?clock\s*)?(?:am|pm)?(?:\s*(?:pst|pdt|pt|est|edt|et|cst|mst|utc|gmt))?\s*$/i.test(t);
}

export function looksLikePersonName(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/^@/, '');
    if (!t || looksLikeTimeOnly(t)) return false;
    if (NAME_STOP.has(t.toLowerCase())) return false;
    if (!/^[A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3}$/.test(t)) return false;
    const first = t.split(/\s+/)[0].toLowerCase().replace(/[.,;:]+$/g, '');
    if (NAME_STOP.has(first)) return false;
    if (/\b(need|send|review|make|tell|ask|have|complete|fix|update|create|remind|submit|share|draft|call|write|please)\b/i.test(t)) {
        return false;
    }
    return true;
}

export function looksLikeFollowupFragment(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return true;
    if (/^(yes|no|yeah|yep|y|n|ok|okay|sure|thanks|please)$/i.test(t)) return true;
    if (looksLikeTimeOnly(t) || looksLikePersonName(t)) return true;
    const words = t.split(/\s+/);
    if (
        words.length <= 6
        && !/\b(need|send|review|make sure|tell|ask|have|complete|fix|update|create|remind|assign|submit|share|draft|call|write|prepare|finish|solve|drivers?|pictures?)\b/i.test(t)
    ) {
        return true;
    }
    return false;
}

export function classifyClarifyAnswer(question, value) {
    const v = String(value || '').replace(/\s+/g, ' ').trim();
    const q = String(question || '');
    if (!v) return {};
    if (looksLikeTimeOnly(v)) return { when: v };
    if (looksLikePersonName(v) || /\b(team|reports|everyone)\b/i.test(v)) return { who: v };
    if (/who|own|assign/i.test(q)) return { who: v };
    if (/when|due|deadline/i.test(q)) return { when: v };
    if (/often|repeat|cadence/i.test(q)) return { cadence: v };
    return { extra: v };
}

export function nameHintsFromText(text) {
    const t = repairMessyPrompt(String(text || ''));
    if (!t.trim()) return [];
    const found = [];
    for (const rx of [TELL_PERSON_RE, ASKED_TO_NAME_RE, WANT_PERSON_TO_RE, HAVE_NAME_RUN_RE, HAVE_NAME_RE, OWNER_NEEDS_RE]) {
        rx.lastIndex = 0;
        let m = rx.exec(t);
        while (m) {
            const name = cleanNameHint(m[1] || '');
            if (name && !found.some((n) => n.toLowerCase() === name.toLowerCase())) {
                found.push(name);
            }
            m = rx.exec(t);
        }
    }
    return found.filter((name) => {
        const others = found.filter((o) => o.toLowerCase() !== name.toLowerCase());
        const tokens = others.flatMap((o) => o.toLowerCase().split(/\s+/));
        return !(name.split(/\s+/).length === 1 && tokens.includes(name.toLowerCase()));
    });
}

export function subjectForPhrase(text) {
    const t = String(text || '');
    const labeled = t.match(/\bfor\s+((?:the\s+)?[A-Za-z0-9][\w'.-]*(?:\s+[A-Za-z0-9][\w'.-]*){0,5}\s+(?:accounts?|clients?|deals?))\b/i);
    if (labeled) return labeled[1].replace(/\s+/g, ' ').trim();
    const poss = t.match(/\b((?:the\s+)?[A-Za-z][\w.-]*(?:\s+[A-Za-z][\w.-]*){0,3})(?:'s)?\s+account\b/i);
    if (poss && !/^(his|her|their|the|my)$/i.test(poss[1].trim())) {
        const name = poss[1].replace(/\s+/g, ' ').trim();
        return /account/i.test(name) ? name : `${name} account`;
    }
    return '';
}

export function matchAssigneesFromPeople(text, people) {
    const hints = nameHintsFromText(text);
    if (!hints.length || !Array.isArray(people) || !people.length) return [];
    const chips = [];
    const seen = new Set();
    for (const hint of hints) {
        const n = hint.toLowerCase();
        const matches = people.filter((p) => {
            const name = String(p?.name || '').toLowerCase();
            if (!name) return false;
            const tokens = name.split(/\s+/);
            const hintTokens = n.split(/\s+/);
            const first = hintTokens[0];
            return name === n
                || name.startsWith(`${n} `)
                || tokens[0] === n
                || tokens.includes(n)
                || (first && (tokens[0] === first || tokens.includes(first)));
        });
        if (matches.length !== 1) continue;
        const p = matches[0];
        const key = p.id || p.email;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        chips.push({ kind: 'user', id: p.id, name: p.name, email: p.email });
    }
    return chips;
}

export function promptNamesSomeoneElse(text) {
    const t = (text || '').trim();
    if (!t) return false;
    if (TEAM_PHRASE_RE.test(t)) return true;
    if (/@[A-Za-z]/.test(t) && !/(^|\s)@me\b/i.test(t)) return true;
    if (nameHintsFromText(t).length) return true;
    if (/\bi(?:'ve| have|'d| had)?\s+(?:asked|told)\s+(?!me\b)[A-Za-z]/i.test(t)) return true;
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
