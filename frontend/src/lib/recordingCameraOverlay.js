/**
 * Always-on-top camera bubble placed on the display being recorded.
 * Uses the unified recording HUD (camera + controls together) via Document PiP
 * so dual-display recordings keep a movable custom surface - not a same-display
 * popup that looks like a tiny Chrome tab.
 */

import {
    openRecordingHudOverlay,
    closeRecordingHudOverlay,
    setHudCameraVisible,
    recordingOverlayNeeded,
} from '@/lib/recordingHudOverlay';
import { listScreens, matchScreenToCapture } from '@/lib/recordingDisplay';

/**
 * Open a camera bubble (with controls) on / over the captured display.
 * @returns {{ mode: 'pip'|'none', win: Window|null, placedOnOtherDisplay: boolean }}
 */
export async function openRecordingCameraOverlay({ stream, trackSettings } = {}) {
    closeRecordingCameraOverlay();
    if (!stream) return { mode: 'none', win: null, placedOnOtherDisplay: false };

    const screens = await listScreens();
    const { screen, reason } = matchScreenToCapture(trackSettings || {}, screens);
    const placedOnOtherDisplay = !!(screen && !screen.isCurrent);
    const needed = recordingOverlayNeeded(trackSettings?.displaySurface, screen) || placedOnOtherDisplay;

    // Only open a separate always-on-top surface when the in-tab bubble would
    // not sit on the recorded display. A same-display popup looks like a tiny
    // Chrome tab; the in-tab bubble / HUD is enough.
    if (!needed) {
        try { window.__tskCameraStream = stream; } catch { /* noop */ }
        return { mode: 'none', win: null, placedOnOtherDisplay: false, reason };
    }

    const result = await openRecordingHudOverlay({
        stream,
        trackSettings,
        needed: true,
        showCamera: true,
    });
    return { ...result, placedOnOtherDisplay, reason };
}

export function setCameraOverlayVisible(visible) {
    setHudCameraVisible(visible);
}

export function closeRecordingCameraOverlay() {
    closeRecordingHudOverlay();
}
