/** Client-side distill for the landing try-it demo (no login, no API). */

const WEEKDAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

const stripLead = (text) => text
    .replace(/^(please|kindly)\s+/i, '')
    .replace(
        /^(ask|tell|have|get|remind|inform)\s+(?:(?:my|the|our)\s+)?(?:team|direct reports|reports|everyone|manager|org|entire org|sales|engineering)\s+(?:to|that)\s+/i,
        '',
    )
    .replace(/\b(?:we|they|you)\s+need\s+to\s+/gi, '')
    .replace(/^that\s+/i, '')
    .trim();

const whoFrom = (text) => {
    if (/\bmanager\b/i.test(text)) return 'Your manager';
    if (/\borg\b|\beveryone\b/i.test(text)) return 'Your org';
    if (/\bsales\b/i.test(text)) return 'Sales';
    if (/\bengineering\b/i.test(text)) return 'Engineering';
    if (/team|direct reports/i.test(text)) return 'Your team';
    return 'The person you named';
};

export const distillLandingPrompt = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return null;

    let who = whoFrom(text);
    let work = stripLead(text);

    const assignWho = text.match(/^assign\s+(.+?)\s+to\s+/i);
    if (assignWho) {
        who = assignWho[1].replace(/^(the|my|our)\s+/i, '').trim();
        if (who) who = who[0].toUpperCase() + who.slice(1);
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
        ? (/^please\b/i.test(work) ? work : `please ${work[0].toLowerCase()}${work.slice(1)}`)
        : 'please complete this';
    const ask = when ? `${when}, ${askCore}.` : `${askCore[0].toUpperCase()}${askCore.slice(1)}.`;

    return {
        title: title.replace(/\.$/, ''),
        ask: ask.replace(/\.\.$/, '.'),
        when: when || 'When you set a time',
        who,
    };
};
