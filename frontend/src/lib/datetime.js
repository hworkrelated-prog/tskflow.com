/** All reminder / notification clocks are America/Los_Angeles - same as get_pst_now(). */
export const APP_TIMEZONE = 'America/Los_Angeles';

const hasZone = (s) => /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);

/** Trim extra fractional seconds so Date.parse accepts the string. */
export function normalizeIsoTimestamp(value) {
    if (value == null || value === '') return '';
    let s = String(value).trim();
    if (!s) return '';
    s = s.replace(/(\.\d{3})\d+/, '$1');
    if (s.includes(' ') && !s.includes('T') && /^\d{4}-\d{2}-\d{2} /.test(s)) {
        s = s.replace(' ', 'T');
    }
    return s;
}

function partsMap(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(date);
    const get = (type) => {
        const v = parts.find((p) => p.type === type)?.value;
        return parseInt(v, 10);
    };
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: get('hour') === 24 ? 0 : get('hour'),
        minute: get('minute'),
        second: get('second'),
    };
}

function offsetMsAt(instant, timeZone) {
    const p = partsMap(instant, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - instant.getTime();
}

/** Interpret a timezone-less wall clock as Pacific. */
export function pacificWallToDate(year, month, day, hour, minute, second = 0) {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    const guess = new Date(utcGuess);
    const instant = new Date(utcGuess - offsetMsAt(guess, APP_TIMEZONE));
    return instant;
}

export function parseAppDate(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const raw = normalizeIsoTimestamp(value);
    if (!raw) return null;

    if (!hasZone(raw) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
        const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (m) {
            return pacificWallToDate(
                Number(m[1]),
                Number(m[2]),
                Number(m[3]),
                Number(m[4]),
                Number(m[5]),
                Number(m[6] || 0),
            );
        }
    }

    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function formatAppDateTime(value) {
    const d = parseAppDate(value);
    if (!d) return '';
    return new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIMEZONE,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(d);
}
