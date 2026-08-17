/** Repair UTF-8 / Windows-1252 mojibake and flatten fancy punctuation. */

const SKIP_KEYS = new Set([
    'password', 'hashed_password', 'token', 'access_token', 'refresh_token',
    'secret', 'authorization', 'cookie', 'signing_secret',
]);

const CP1252_FROM_UNICODE = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
};

const PUNCT = [
    [/\u2018|\u2019|\u201a|\u201b|\u02bc/g, "'"],
    [/\u201c|\u201d|\u201e/g, '"'],
    [/\u2013|\u2014|\u2212|\u2551/g, '-'],
    [/\u2026/g, '...'],
    [/\u00a0/g, ' '],
    [/\u2022/g, '*'],
];

const MOJI_MARK = /[\u00c2\u00c3\u00e2\u0080-\u009f\ufffd]/;
const LEFTOVER = /(?:\u00c3\u00a2|\u00e2)(?:\s?[\u00c2\u00a0\u20ac\u2018-\u201e\u2122\u2551\u0080-\u009f\-])+/g;

function encodeCp1252(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i += 1) {
        const c = str.charCodeAt(i);
        let b = c;
        if (c > 0xff) {
            b = CP1252_FROM_UNICODE[c];
            if (b == null) return null;
        }
        bytes[i] = b;
    }
    return bytes;
}

function leftoverPunct(blob) {
    if (/[\u2122\u2019\u2018']/.test(blob)) return "'";
    if (/[\u201c\u201d"]/.test(blob)) return '"';
    return '-';
}

export function cleanDisplayText(s) {
    if (s == null || s === '') return s == null ? '' : s;
    let t = String(s);
    for (let i = 0; i < 4; i += 1) {
        if (!MOJI_MARK.test(t)) break;
        const bytes = encodeCp1252(t);
        if (!bytes) break;
        try {
            const cand = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            if (cand === t) break;
            t = cand;
        } catch {
            break;
        }
    }
    PUNCT.forEach(([re, to]) => {
        t = t.replace(re, to);
    });
        t = t.replace(/[\u0080-\u009f]/g, '');
        LEFTOVER.lastIndex = 0;
        t = t.replace(LEFTOVER, leftoverPunct);
    t = t.replace(/ {2,}/g, ' ');
    return t;
}

export function cleanJsonTree(obj, key) {
    if (typeof obj === 'string') {
        if (key && SKIP_KEYS.has(String(key).toLowerCase())) return obj;
        return cleanDisplayText(obj);
    }
    if (Array.isArray(obj)) return obj.map((x) => cleanJsonTree(x));
    if (obj && typeof obj === 'object') {
        const out = {};
        Object.keys(obj).forEach((k) => {
            out[k] = cleanJsonTree(obj[k], k);
        });
        return out;
    }
    return obj;
}
