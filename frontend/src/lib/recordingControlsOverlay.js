/**
 * Always-on-top recording controls for when the user is presenting another tab/window.
 * Prefers Document Picture-in-Picture (Chrome). Avoids a tiny popup window —
 * those look like a shortened Chrome tab because the browser draws tab chrome.
 *
 * Delegates to the unified HUD (camera + controls in one movable surface).
 */

import {
    openRecordingHudOverlay,
    closeRecordingHudOverlay,
    recordingOverlayNeeded as hudNeeded,
} from '@/lib/recordingHudOverlay';

/**
 * Open always-on-top controls only when the in-tab pill is not on the recorded surface.
 * Returns { mode: 'pip'|'none', win }.
 */
export async function openRecordingControlsOverlay({ needed = true, stream = null, trackSettings = {}, showCamera = false } = {}) {
    if (!needed) return { mode: 'none', win: null };
    return openRecordingHudOverlay({
        stream,
        trackSettings,
        needed: true,
        showCamera: !!(showCamera && stream),
    });
}

export function closeRecordingControlsOverlay() {
    closeRecordingHudOverlay();
}

export function recordingOverlayNeeded(displaySurface, screen) {
    return hudNeeded(displaySurface, screen);
}
