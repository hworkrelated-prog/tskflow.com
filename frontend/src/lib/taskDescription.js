/** Turn stored task copy into readable layout (numbered steps, Next steps). */
import { cleanDisplayText } from './cleanDisplayText.js';

function decodeEntities(s) {
    return String(s || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"');
}

export function descriptionHasStructuredHtml(raw) {
    return /<(ul|ol|li)[\s>]/i.test(String(raw || ''));
}

export function layoutTaskDescription(raw) {
    if (!raw) return '';
    let s = cleanDisplayText(String(raw));
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n');
    s = s.replace(/<li[^>]*>/gi, '');
    s = s.replace(/<[^>]*>/g, ' ');
    s = decodeEntities(s);
    s = s.replace(/\s*((?:Next\s+)?steps?):\s*/i, (_, label) => {
        const pretty = /^next/i.test(label) ? 'Next steps:' : 'Steps:';
        return `\n\n${pretty}\n`;
    });
    s = s.replace(/([^\n])[ \t]+(\d{1,2})[.)][ \t]+/g, '$1\n$2. ');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    s = s.replace(/[ \t]{2,}/g, ' ');
    return s.trim();
}

export function parseDescriptionBlocks(raw) {
    const text = layoutTaskDescription(raw);
    if (!text) return [];
    const blocks = [];
    let para = [];
    let list = null;

    const flushPara = () => {
        const joined = para.join('\n').trim();
        if (joined) blocks.push({ type: 'p', text: joined });
        para = [];
    };
    const flushList = () => {
        if (list?.items?.length) blocks.push({ type: 'ol', items: list.items });
        list = null;
    };

    for (const line of text.split('\n')) {
        const heading = line.trim().match(/^(next steps|steps):?$/i);
        const item = line.match(/^\s*(\d{1,2})[.)]\s+(.*)$/);
        if (heading) {
            flushPara();
            flushList();
            blocks.push({ type: 'h', text: `${heading[1][0].toUpperCase()}${heading[1].slice(1).toLowerCase()}:` });
            continue;
        }
        if (item) {
            flushPara();
            if (!list) list = { items: [] };
            list.items.push(item[2].trim());
            continue;
        }
        if (!line.trim()) {
            flushPara();
            flushList();
            continue;
        }
        flushList();
        para.push(line);
    }
    flushPara();
    flushList();
    return blocks;
}

/** Titles like "Complete This is a reminder…" — drop the glued command. */
export function displayTaskTitle(raw) {
    let s = cleanDisplayText(raw).replace(/\s+/g, ' ').trim();
    s = s.replace(/^Complete\s+(?=(this|that|these|those|i\b|my\b))/i, '');
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Last-resort title when the model returns junk — don't prefix sentences with "Complete". */
export function fallbackTaskTitle(seed) {
    const cleaned = String(seed || '')
        .replace(/^(an?|the)\s+/i, '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8)
        .join(' ');
    if (!cleaned) return '';
    if (/^(complete|this|that|these|those|i|my|prepare|send|review|update|create|fix|draft|remind)\b/i.test(cleaned)) {
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return `Complete ${cleaned}`;
}

export function rewriteSelfAssignCopy(text) {
    if (!text) return text;
    let s = String(text);
    s = s.replace(/^Please\s+/i, '');
    s = s.replace(/\bplease\s+/gi, '');
    s = s.replace(/\bour\s+(1\s*:\s*1|one[\s-]?on[\s-]?one|one[\s-]?to[\s-]?one)\b/gi, 'my 1:1');
    s = s.replace(/\bour\s+(meeting|call|standup|sync|review|deck|notes)\b/gi, 'the $1');
    s = s.replace(/\bour\b/gi, 'my');
    s = s.replace(/\bwe'll\b/gi, "I'll");
    s = s.replace(/\bwe're\b/gi, "I'm");
    s = s.replace(/\bwe are\b/gi, 'I am');
    s = s.replace(/\bwe\s+need\s+to\b/gi, 'I need to');
    s = s.replace(/\bwe\s+have\s+to\b/gi, 'I have to');
    s = s.replace(/\bwe\s+should\b/gi, 'I should');
    return s;
}

export function isSelfAssigneeChip(a, userId) {
    if (!a) return false;
    const id = String(a.id || '');
    const name = String(a.name || '').trim().toLowerCase();
    if (id === 'self' || name === 'me' || name === 'myself') return true;
    if (userId && id && id === userId) return true;
    return false;
}

export function assigneesAreSelf(assignees, userId) {
    const list = Array.isArray(assignees) ? assignees.filter(Boolean) : [];
    return list.length > 0 && list.every((a) => isSelfAssigneeChip(a, userId));
}

export function sentTaskFollowupMessage({
    names,
    isSelf,
    slackConnected,
    canManageSlack,
} = {}) {
    if (isSelf) {
        return "Saved for you. I’ll nudge you here if it’s still open.";
    }
    const who = (names || '').trim() || 'your team';
    if (slackConnected) {
        return `Sent to ${who}. I’ll follow up if they go quiet — and if they ignore two pings, I’ll Slack them with you in the loop.`;
    }
    if (canManageSlack) {
        return `Sent to ${who}. I’ll follow up here if they go quiet. Connect Slack in Settings (admins only) to also ping them there after two ignored reminders.`;
    }
    return `Sent to ${who}. I’ll follow up here if they go quiet. Your admin can connect Slack in Settings — once they do, those follow-ups can go to Slack too.`;
}
