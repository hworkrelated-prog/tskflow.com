/** One visual cast for the landing scroll story. Sales-flavored throughout. */

export const CAST = {
    alex: {
        id: 'alex',
        name: 'Alex Rivera',
        short: 'Alex',
        initial: 'A',
        bg: '#0f766e',
        fg: '#ecfdf5',
        photo: '/avatars/alex.svg',
        email: 'alex@acmecorp.com',
    },
    hashim: { id: 'hashim', name: 'Hashim', initial: 'H', bg: '#0f766e', fg: '#ecfdf5' },
    maya: {
        id: 'maya',
        name: 'Maya Chen',
        short: 'Maya',
        initial: 'M',
        bg: '#0e7490',
        fg: '#ecfeff',
        photo: '/avatars/maya.svg',
        email: 'maya@acmecorp.com',
    },
    chris: {
        id: 'chris',
        name: 'Chris Park',
        short: 'Chris',
        initial: 'C',
        bg: '#b45309',
        fg: '#fffbeb',
        photo: '/avatars/chris.svg',
        email: 'chris@acmecorp.com',
    },
    priya: {
        id: 'priya',
        name: 'Priya Shah',
        short: 'Priya',
        initial: 'P',
        bg: '#6d28d9',
        fg: '#f5f3ff',
        photo: '/avatars/priya.svg',
        email: 'priya@acmecorp.com',
    },
    jordan: {
        id: 'jordan',
        name: 'Jordan Hale',
        short: 'Jordan',
        initial: 'J',
        bg: '#be123c',
        fg: '#fff1f2',
        photo: '/avatars/jordan.svg',
        email: 'jordan@acmecorp.com',
    },
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
