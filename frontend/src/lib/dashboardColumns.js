/** Dashboard column ids, in swipe order. */
export const DASHBOARD_COLUMNS = [
    { id: 'to-me', name: 'To me' },
    { id: 'personal', name: 'Personal' },
    { id: 'delegated', name: 'Delegated' },
];

export const DASHBOARD_MOBILE_MQ = '(max-width: 767px)';

export function dueTimestamp(value) {
    if (!value) return Number.POSITIVE_INFINITY;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

export function soonestDueTimestamp(items) {
    let soonest = Number.POSITIVE_INFINITY;
    for (const item of items || []) {
        const ms = dueTimestamp(item?.due_date);
        if (ms < soonest) soonest = ms;
    }
    return soonest;
}

/**
 * Index of the column whose soonest due date is closest (overdue counts as closest).
 * Empty columns are skipped. If nothing has a due date, the first non-empty column wins.
 * If every column is empty, returns 0 (To me).
 */
export function columnWithSoonestDue(columns) {
    let bestIndex = 0;
    let bestMs = Number.POSITIVE_INFINITY;
    let found = false;
    (columns || []).forEach((col, index) => {
        const items = col?.items || [];
        if (!items.length) return;
        const ms = soonestDueTimestamp(items);
        if (!found || ms < bestMs) {
            found = true;
            bestIndex = index;
            bestMs = ms;
        }
    });
    return bestIndex;
}
