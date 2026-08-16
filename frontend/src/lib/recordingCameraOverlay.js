/**
 * Always-on-top camera bubble placed on the display being recorded.
 * Document PiP floats over windows/tabs; a positioned popup follows a
 * chosen monitor so dual-display recordings keep the camera in view
 * (and in the file when the user captured that entire screen).
 */

import { listScreens, matchScreenToCapture, popupBoxOnScreen } from '@/lib/recordingDisplay';

const POPUP_NAME = 'tsk_recording_camera';

const renderCameraHtml = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Camera</title>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:100%;height:100%}
  body{display:flex;align-items:center;justify-content:center}
  .bubble{width:156px;height:156px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,.85);
    box-shadow:0 10px 28px rgba(0,0,0,.35);background:#0f172a;position:relative}
  video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);background:#0f172a}
  .off{position:absolute;inset:0;display:none;align-items:center;justify-content:center;
    color:rgba(255,255,255,.7);font:12px/1.2 ui-sans-serif,system-ui,sans-serif;background:#0f172a}
  body.cam-off .off{display:flex}
  body.cam-off video{visibility:hidden}
</style></head>
<body>
  <div class="bubble">
    <video id="cam" autoplay muted playsinline></video>
    <div class="off">Camera off</div>
  </div>
  <script>
    const stream = () => {
      try { return (window.opener && window.opener.__tskCameraStream) || window.__tskCameraStream || null; }
      catch { return window.__tskCameraStream || null; }
    };
    const api = () => {
      try { return (window.opener && window.opener.__tskRecorderApi) || window.__tskRecorderApi || null; }
      catch { return null; }
    };
    const v = document.getElementById('cam');
    const attach = () => {
      const s = stream();
      if (s && v.srcObject !== s) {
        v.srcObject = s;
        v.play().catch(() => {});
      }
      const a = api();
      const on = !a || !a.getState || a.getState().camOn !== false;
      document.body.classList.toggle('cam-off', !on);
      if (a && a.getState && a.getState().recording === false) {
        try { window.close(); } catch {}
      }
    };
    attach();
    setInterval(attach, 350);
  </script>
</body></html>`;

const wireCameraDocument = (doc) => {
    doc.open();
    doc.write(renderCameraHtml());
    doc.close();
    try {
        doc.defaultView.__tskCameraStream = window.__tskCameraStream;
        doc.defaultView.__tskRecorderApi = window.__tskRecorderApi;
        const sync = setInterval(() => {
            try {
                if (!doc.defaultView || doc.defaultView.closed) { clearInterval(sync); return; }
                doc.defaultView.__tskCameraStream = window.__tskCameraStream;
                doc.defaultView.__tskRecorderApi = window.__tskRecorderApi;
            } catch { clearInterval(sync); }
        }, 400);
    } catch { /* noop */ }
};

const tryCameraPip = async () => {
    try {
        if (!window.documentPictureInPicture?.requestWindow) return null;
        try { window.documentPictureInPicture.window?.close?.(); } catch { /* noop */ }
        const pip = await window.documentPictureInPicture.requestWindow({
            width: 176,
            height: 176,
        });
        wireCameraDocument(pip.document);
        return { mode: 'pip', win: pip };
    } catch (e) {
        console.warn('Document PiP camera unavailable', e);
        return null;
    }
};

const openCameraPopup = (screen) => {
    try {
        const box = popupBoxOnScreen(screen, {
            width: 176,
            height: 176,
            corner: 'bottom-left',
            margin: 28,
        });
        const w = window.open('about:blank', POPUP_NAME, box.features);
        if (!w) return null;
        wireCameraDocument(w.document);
        try { w.focus(); } catch { /* noop */ }
        return { mode: 'popup', win: w, screen };
    } catch {
        return null;
    }
};

/**
 * Open a camera bubble on the captured display.
 * @returns {{ mode: 'pip'|'popup'|'none', win: Window|null, placedOnOtherDisplay: boolean }}
 */
export async function openRecordingCameraOverlay({ stream, trackSettings } = {}) {
    closeRecordingCameraOverlay();
    if (!stream) return { mode: 'none', win: null, placedOnOtherDisplay: false };

    try { window.__tskCameraStream = stream; } catch { /* noop */ }

    const screens = await listScreens();
    const { screen, reason } = matchScreenToCapture(trackSettings || {}, screens);
    const placedOnOtherDisplay = !!(screen && !screen.isCurrent);

    // Prefer a real popup so we can place it on the captured monitor.
    // Document PiP cannot be positioned and would steal the controls PiP.
    const popup = openCameraPopup(screen);
    if (popup) {
        try { window.__tskCameraOverlayWin = popup.win; } catch { /* noop */ }
        return { ...popup, placedOnOtherDisplay, reason };
    }

    const pip = await tryCameraPip();
    if (pip) {
        try { window.__tskCameraOverlayWin = pip.win; } catch { /* noop */ }
        return { ...pip, placedOnOtherDisplay: false, reason };
    }

    return { mode: 'none', win: null, placedOnOtherDisplay: false, reason };
}

export function setCameraOverlayVisible(visible) {
    const win = window.__tskCameraOverlayWin;
    try {
        if (win?.document?.body) {
            win.document.body.style.visibility = visible ? 'visible' : 'hidden';
        }
    } catch { /* noop */ }
}

export function closeRecordingCameraOverlay() {
    try { window.__tskCameraOverlayWin?.close?.(); } catch { /* noop */ }
    try { delete window.__tskCameraOverlayWin; } catch { /* noop */ }
    try { delete window.__tskCameraStream; } catch { /* noop */ }
}
