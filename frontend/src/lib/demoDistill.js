/** Client-side distill for the landing try-it demo (no login, no API). */

const WEEKDAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

export const distillLandingPrompt = (raw) => {
    const text = String(raw || '').trim();
    if (!text) return null;

    let work = text
        .replace(/^(please|kindly)\s+/i, '')
        .replace(
            /^(ask|tell|have|get|remind|inform)\s+(?:(?:my|the|our)\s+)?(?:team|direct reports|reports|everyone)\s+(?:to|that)\s+/i,
            '',
        )
        .replace(/\b(?:we|they|you)\s+need\s+to\s+/gi, '')
        .replace(/^that\s+/i, '')
        .trim();

    let when = '';
    const onDay = work.match(new RegExp(`\\bon\\s+(${WEEKDAYS})\\b`, 'i'));
    if (onDay) {
        when = `On ${onDay[1][0].toUpperCase()}${onDay[1].slice(1).toLowerCase()}`;
        work = work.replace(onDay[0], ' ').trim();
    } else if (/\btomorrow\b/i.test(work)) {
        when = 'Tomorrow';
        work = work.replace(/\btomorrow\b/i, ' ').trim();
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
        who: /team|everyone/i.test(text) ? 'Your team' : 'The person you named',
    };
};
