/**
 * Multi-display helpers for screen recording.
 * Places camera / controls on the monitor the user actually picked.
 */

export function fallbackScreens(screenLike = typeof window !== 'undefined' ? window.screen : null) {
    const s = screenLike || {};
    const availLeft = Number.isFinite(s.availLeft) ? s.availLeft : 0;
    const availTop = Number.isFinite(s.availTop) ? s.availTop : 0;
    const availWidth = s.availWidth || s.width || 1280;
    const availHeight = s.availHeight || s.height || 720;
    const width = s.width || availWidth;
    const height = s.height || availHeight;
    return [{
        left: Number.isFinite(s.left) ? s.left : availLeft,
        top: Number.isFinite(s.top) ? s.top : availTop,
        width,
        height,
        availLeft,
        availTop,
        availWidth,
        availHeight,
        devicePixelRatio: 1,
        isCurrent: true,
        isPrimary: true,
        label: 'This display',
    }];
}

export function normalizeScreens(details) {
    if (!details?.screens?.length) return fallbackScreens();
    const current = details.currentScreen;
    return details.screens.map((s) => ({
        left: s.left,
        top: s.top,
        width: s.width,
        height: s.height,
        availLeft: s.availLeft,
        availTop: s.availTop,
        availWidth: s.availWidth,
        availHeight: s.availHeight,
        devicePixelRatio: s.devicePixelRatio || 1,
        isCurrent: !!(current && s === current) || !!s.isCurrent,
        isPrimary: !!s.isPrimary,
        label: s.label || `${s.width}×${s.height}`,
    }));
}

const sizeScore = (sw, sh, w, h) => Math.abs(sw - w) + Math.abs(sh - h);

export function screenSizeScore(screen, width, height) {
    if (!width || !height) return Number.POSITIVE_INFINITY;
    const dpr = screen.devicePixelRatio || 1;
    const candidates = [
        [screen.width, screen.height],
        [screen.availWidth, screen.availHeight],
        [Math.round(screen.width * dpr), Math.round(screen.height * dpr)],
        [Math.round(screen.availWidth * dpr), Math.round(screen.availHeight * dpr)],
        [Math.round(screen.width / dpr), Math.round(screen.height / dpr)],
    ];
    return Math.min(...candidates.map(([sw, sh]) => sizeScore(sw, sh, width, height)));
}

/**
 * Pick the physical display that matches a getDisplayMedia video track.
 *
 * Dual-monitor heuristic: when recording an entire screen and two displays
 * score similarly, prefer the display that is NOT hosting TskFlow - that is
 * almost always the one the user just selected.
 */
export function matchScreenToCapture(trackSettings = {}, screens = []) {
    const list = Array.isArray(screens) && screens.length ? screens : fallbackScreens();
    const surface = trackSettings.displaySurface || null;
    const width = trackSettings.width || 0;
    const height = trackSettings.height || 0;
    const current = list.find((s) => s.isCurrent) || list[0];

    if (surface === 'window' || surface === 'browser') {
        return { screen: current, reason: surface, score: 0 };
    }

    const ranked = list
        .map((screen) => ({ screen, score: screenSizeScore(screen, width, height) }))
        .sort((a, b) => a.score - b.score);

    const best = ranked[0];
    const second = ranked[1];
    const close = (entry) => entry && entry.score < 240;

    if (surface === 'monitor' && list.length >= 2) {
        const closeMatches = ranked.filter(close);
        if (closeMatches.length === 1) {
            return { screen: closeMatches[0].screen, reason: 'size-match', score: closeMatches[0].score };
        }
        if (closeMatches.length > 1) {
            const other = closeMatches.find((e) => !e.screen.isCurrent);
            if (other) return { screen: other.screen, reason: 'other-display', score: other.score };
        }
        if (best && second && Math.abs(best.score - second.score) < 80) {
            const other = ranked.find((e) => !e.screen.isCurrent);
            if (other) return { screen: other.screen, reason: 'other-display', score: other.score };
        }
        const other = list.find((s) => !s.isCurrent);
        if (other && (!close(best) || best.screen.isCurrent)) {
            return { screen: other, reason: 'other-display', score: screenSizeScore(other, width, height) };
        }
    }

    if (best && close(best)) {
        return { screen: best.screen, reason: 'size-match', score: best.score };
    }
    return { screen: current, reason: 'current', score: best ? best.score : 0 };
}

export function popupBoxOnScreen(screen, {
    width,
    height,
    corner = 'bottom-left',
    margin = 24,
} = {}) {
    const s = screen || fallbackScreens()[0];
    const left = corner.includes('right')
        ? s.availLeft + s.availWidth - width - margin
        : s.availLeft + margin;
    const top = corner.includes('bottom')
        ? s.availTop + s.availHeight - height - margin
        : s.availTop + margin;
    return {
        left: Math.round(left),
        top: Math.round(top),
        width,
        height,
        features: `popup=1,noopener=0,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)},toolbar=0,menubar=0,location=0,status=0,resizable=1`,
    };
}

export async function listScreens() {
    if (typeof window === 'undefined') return fallbackScreens();
    try {
        if (typeof window.getScreenDetails === 'function') {
            const details = await window.getScreenDetails();
            return normalizeScreens(details);
        }
    } catch { /* permission denied or unsupported */ }
    return fallbackScreens(window.screen);
}
