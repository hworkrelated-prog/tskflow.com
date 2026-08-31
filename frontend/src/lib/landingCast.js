/** One visual cast for the landing scroll story. Sales-flavored throughout. */

export const CAST = {
    hashim: { id: 'hashim', name: 'Hashim', initial: 'H', bg: '#0f766e', fg: '#ecfdf5' },
    maya: { id: 'maya', name: 'Maya', initial: 'M', bg: '#0e7490', fg: '#ecfeff' },
    chris: { id: 'chris', name: 'Chris', initial: 'C', bg: '#b45309', fg: '#fffbeb' },
    priya: { id: 'priya', name: 'Priya', initial: 'P', bg: '#6d28d9', fg: '#f5f3ff' },
    jordan: { id: 'jordan', name: 'Jordan', initial: 'J', bg: '#be123c', fg: '#fff1f2' },
};

export const TEAM = [CAST.maya, CAST.chris, CAST.priya, CAST.jordan];

export const TASKS = [
    { id: 't1', title: 'Send the Q3 forecast', who: 'maya', tone: 'teal', due: 'Friday' },
    { id: 't2', title: 'Send proposal to Acme', who: 'maya', tone: 'amber' },
    { id: 't3', title: 'Update Salesforce stage', who: 'maya', tone: 'sky' },
    { id: 't4', title: 'Log discovery call', who: 'maya', tone: 'rose' },
];

export const GROUP_BOARD = [
    { who: 'priya', pct: 100 },
    { who: 'chris', pct: 72 },
    { who: 'maya', pct: 40 },
    { who: 'jordan', pct: 18 },
];

export const GROUP_AVG = Math.round(
    GROUP_BOARD.reduce((sum, row) => sum + row.pct, 0) / GROUP_BOARD.length,
);

export const WEEK = [
    { d: 'Mon', busy: [true, true] },
    { d: 'Tue', busy: [false, true], open: true },
    { d: 'Wed', busy: [true, true] },
    { d: 'Thu', busy: [false, true], open: true },
    { d: 'Fri', busy: [true, true] },
];
