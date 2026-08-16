/** Turn stored task copy into readable layout (numbered steps, Next steps). */

export function layoutTaskDescription(raw) {
    if (!raw) return '';
    let s = String(raw).replace(/<[^>]*>/g, ' ');
    s = s.replace(/\s*Next steps?:\s*/i, '\n\nNext steps:\n');
    s = s.replace(/([^\n])[ \t]+(\d{1,2})[.)][ \t]+/g, '$1\n$2. ');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    return s.trim();
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
