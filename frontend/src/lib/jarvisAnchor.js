/** Compact orb size used when the command bar is on screen. */
export const JARVIS_SIZE = 44;
export const JARVIS_GAP = 16;

/**
 * Park Jarvis next to the command bar when there is room, otherwise
 * sit it just above the bar's trailing edge so it never covers the prompt.
 * Uses left/top from the bar's box so mobile viewports stay accurate.
 */
export function jarvisAnchorFromDock(rect, viewport) {
    const width = viewport?.width ?? 0;
    const fromRight = Math.max(0, width - rect.right);
    const beside = fromRight >= JARVIS_SIZE + JARVIS_GAP + 8;
    if (beside) {
        return {
            placement: 'beside',
            left: rect.right + JARVIS_GAP,
            top: Math.max(8, rect.bottom - JARVIS_SIZE),
        };
    }
    return {
        placement: 'above',
        left: Math.max(8, rect.right - JARVIS_SIZE),
        top: Math.max(8, rect.top - JARVIS_GAP - JARVIS_SIZE),
    };
}

export function applyJarvisAnchor(root, anchor) {
    if (!root?.style) return;
    root.style.setProperty('--ai-jarvis-left', `${Math.round(anchor.left)}px`);
    root.style.setProperty('--ai-jarvis-top', `${Math.round(anchor.top)}px`);
    root.classList.toggle('ai-jarvis-beside', anchor.placement === 'beside');
    root.classList.toggle('ai-jarvis-above', anchor.placement === 'above');
}

export function clearJarvisAnchor(root) {
    if (!root?.style) return;
    root.style.removeProperty('--ai-jarvis-left');
    root.style.removeProperty('--ai-jarvis-top');
    root.classList.remove('ai-jarvis-beside', 'ai-jarvis-above');
}
