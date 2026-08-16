export const THEMES = ['light', 'dark', 'minimal'];

export const readCachedTheme = () => {
    try {
        const t = localStorage.getItem('tsk_theme');
        return THEMES.includes(t) ? t : null;
    } catch {
        return null;
    }
};

export const applyTheme = (theme) => {
    const next = THEMES.includes(theme) ? theme : 'light';
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.style.colorScheme = next === 'dark' ? 'dark' : 'light';
    }
    try {
        localStorage.setItem('tsk_theme', next);
    } catch { /* private mode */ }
    return next;
};
