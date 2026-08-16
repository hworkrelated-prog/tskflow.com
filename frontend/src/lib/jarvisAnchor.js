/** Compact orb size used when the command bar is on screen. */
export const JARVIS_SIZE = 44;
export const JARVIS_GAP = 10;

/**
 * Park Jarvis next to the command bar when there is room, otherwise
 * sit it just above the bar's trailing edge so it never covers the prompt.
 */
export function jarvisAnchorFromDock(rect, viewport) {
    const width = viewport?.width ?? 0;
    const height = viewport?.height ?? 0;
    const fromRight = Math.max(0, width - rect.right);
    const fromBottom = Math.max(0, height - rect.bottom);
    const beside = fromRight >= JARVIS_SIZE + JARVIS_GAP + 8;
    if (beside) {
        return {
            placement: 'beside',
            right: Math.max(8, fromRight - JARVIS_SIZE - JARVIS_GAP),
            bottom: Math.max(8, fromBottom),
        };
    }
    return {
        placement: 'above',
        right: Math.max(8, fromRight),
        bottom: Math.max(8, height - rect.top + JARVIS_GAP),
    };
}

export function applyJarvisAnchor(root, anchor) {
    if (!root?.style) return;
    root.style.setProperty('--ai-jarvis-right', `${Math.round(anchor.right)}px`);
    root.style.setProperty('--ai-jarvis-bottom', `${Math.round(anchor.bottom)}px`);
    root.classList.toggle('ai-jarvis-beside', anchor.placement === 'beside');
    root.classList.toggle('ai-jarvis-above', anchor.placement === 'above');
}

export function clearJarvisAnchor(root) {
    if (!root?.style) return;
    root.style.removeProperty('--ai-jarvis-right');
    root.style.removeProperty('--ai-jarvis-bottom');
    root.classList.remove('ai-jarvis-beside', 'ai-jarvis-above');
}
