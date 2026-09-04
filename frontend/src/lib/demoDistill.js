/** Client-side distill for the landing try-it demo (no login, no API). */

const WEEKDAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const CROWD = /\b(team|org|everyone|sales|engineering|reports|east coast)\b/i;
const ROLE_WHO = [
    [/\bmanager\b/i, 'Your manager'],
    [/\borg\b|\beveryone\b/i, 'Your org'],
    [/\bsales\b/i, 'Sales'],
    [/\bengineering\b/i, 'Engineering'],
    [/team|direct reports/i, 'Your team'],
];

const stripLead = (text) => text
    .replace(/^(please|kindly)\s+/i, '')
    .replace(
        /^(ask|tell|have|get|remind|inform)\s+(?:(?:my|the|our)\s+)?(?:team|direct reports|reports|everyone|manager|org|entire org|sales(?:\s+team)?|engineering|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:to|that|for)\s+/i,
        '',
    )
    .replace(/^(?:their|the)\s+/i, '')
    .replace(/\b(?:we|they|you)\s+need\s+to\s+/gi, '')
    .replace(/^that\s+/i, '')
    .trim();

const isCrowdWho = (who) => CROWD.test(who);

const whoFrom = (text) => {
    const named = text.match(
        /\b(?:[Aa]sk|[Tt]ell|[Rr]emind|[Hh]ave)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s+(?:to|for))\b/,
    );
    if (named && !/^(The|My|Our|Your)$/.test(named[1])) {
        return { who: named[1], crowd: false };
    }
    for (const [pattern, who] of ROLE_WHO) {
        if (pattern.test(text)) return { who, crowd: isCrowdWho(who) || CROWD.test(text) };
    }
    return { who: 'The person you named', crowd: CROWD.test(text) };
};

export const distillLandingPrompt = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return null;

    let { who, crowd } = whoFrom(text);
    let work = stripLead(text);

    const assignWho = text.match(/^assign\s+(.+?)\s+to\s+/i);
    if (assignWho) {
        who = assignWho[1].replace(/^(the|my|our)\s+/i, '').trim();
        if (who) who = who[0].toUpperCase() + who.slice(1);
        crowd = isCrowdWho(who);
        work = text.replace(/^assign\s+.+?\s+to\s+/i, '').trim();
    }

    let when = '';
    const everyDay = work.match(/\bevery day at (\d+)\b/i);
    const onDay = work.match(new RegExp(`\\bon\\s+(${WEEKDAYS})\\b`, 'i'));
    const byWeekday = work.match(new RegExp(`\\bby\\s+(${WEEKDAYS})\\b`, 'i'));
    if (everyDay) {
        when = `Every day at ${everyDay[1]}`;
        work = work.replace(everyDay[0], ' ').trim();
    } else if (/\bby 5 each day\b/i.test(work)) {
        when = 'By 5 each day';
        work = work.replace(/\bby 5 each day\b/i, ' ').trim();
    } else if (onDay) {
        when = `On ${onDay[1][0].toUpperCase()}${onDay[1].slice(1).toLowerCase()}`;
        work = work.replace(onDay[0], ' ').trim();
    } else if (byWeekday) {
        when = `By ${byWeekday[1][0].toUpperCase()}${byWeekday[1].slice(1).toLowerCase()}`;
        work = work.replace(byWeekday[0], ' ').trim();
    } else if (/\btomorrow\b/i.test(work)) {
        when = 'Tomorrow';
        work = work.replace(/\bby\s+tomorrow\b/i, ' ').replace(/\btomorrow\b/i, ' ').trim();
    } else if (/\bby eod\b/i.test(work)) {
        when = 'By EOD';
        work = work.replace(/\bby eod\b/i, ' ').trim();
    }

    work = work.replace(/\s+/g, ' ').replace(/^[,. ]+|[,. ]+$/g, '');
    const title = work
        ? work.replace(/^(please|kindly)\s+/i, '').replace(/^./, (c) => c.toUpperCase())
        : when
            ? `Complete this ${when.toLowerCase()}`
            : 'Complete this';

    const askCore = work
        ? (/^please\b/i.test(work)
            ? work
            : /^(send|submit|log|record|finish|complete|update|review|share|write|prepare)\b/i.test(work)
                ? `please ${work[0].toLowerCase()}${work.slice(1)}`
                : `please send ${work[0].toLowerCase()}${work.slice(1)}`)
        : 'please complete this';
    const ask = when ? `${when}, ${askCore}.` : `${askCore[0].toUpperCase()}${askCore.slice(1)}.`;

    return {
        title: title.replace(/\.$/, ''),
        ask: ask.replace(/\.\.$/, '.'),
        when: when || 'When you set a time',
        who,
        crowd,
    };
};
