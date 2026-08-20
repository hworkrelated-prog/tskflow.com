export const THEMES = ['light', 'dark', 'minimal'];

export const readCachedTheme = () => {
    try {
        const t = localStorage.getItem('tsk_theme');
        return THEMES.includes(t) ? t : null;
    } catch {
        return null;
    }
};

const paintDocumentTheme = (theme) => {
    const next = THEMES.includes(theme) ? theme : 'light';
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.style.colorScheme = next === 'dark' ? 'dark' : 'light';
    }
    return next;
};

export const applyTheme = (theme) => {
    const next = paintDocumentTheme(theme);
    try {
        localStorage.setItem('tsk_theme', next);
    } catch { /* private mode */ }
    return next;
};

/** Temporarily paint the document without writing localStorage (marketing pages). */
export const pinDocumentTheme = (theme) => paintDocumentTheme(theme);

/** Restore the user’s saved app theme after leaving a pinned marketing page. */
export const restoreDocumentTheme = () => paintDocumentTheme(readCachedTheme() || 'light');
