/**
 * Unified always-on-top recording HUD: camera bubble + controls in one
 * Document Picture-in-Picture window. Avoids separate Chrome popup windows
 * (those look like a shortened tab). One movable surface keeps mic/cam/stop
 * consistent while the user records another screen or window.
 */

import { matchScreenToCapture, listScreens } from '@/lib/recordingDisplay';

const renderHudHtml = ({ showCamera }) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title> </title>
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:#0f172a;overflow:hidden;
    font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;
    user-select:none;-webkit-user-select:none}
  .hud{display:flex;align-items:center;gap:10px;width:100%;height:100%;box-sizing:border-box;
    padding:10px 12px;background:linear-gradient(180deg,#1e293b 0%,#0f172a 100%)}
  .cam-wrap{position:relative;width:88px;height:88px;flex-shrink:0;border-radius:50%;
    overflow:hidden;border:2px solid rgba(255,255,255,.85);box-shadow:0 8px 22px rgba(0,0,0,.4);
    background:#020617;cursor:grab}
  .cam-wrap:active{cursor:grabbing}
  .cam-wrap video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);background:#020617}
  .cam-off{position:absolute;inset:0;display:none;align-items:center;justify-content:center;
    font-size:11px;color:rgba(255,255,255,.65);background:#0f172a;text-align:center;padding:6px}
  body.cam-hidden .cam-wrap{display:none}
  body.cam-off .cam-off{display:flex}
  body.cam-off video{visibility:hidden}
  .side{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;justify-content:center}
  .meta{display:flex;align-items:center;gap:8px}
  .dot{width:8px;height:8px;border-radius:50%;background:#fb7185;flex-shrink:0}
  .dot.paused{background:#fcd34d;animation:none}
  .dot:not(.paused){animation:pulse 1.2s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
  .tm{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;font-weight:700;letter-spacing:.02em}
  .lbl{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.45)}
  .row{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
  button{appearance:none;border:0;background:transparent;color:rgba(255,255,255,.92);
    width:34px;height:34px;border-radius:10px;cursor:pointer;display:inline-flex;
    align-items:center;justify-content:center;font-size:14px}
  button:hover{background:rgba(255,255,255,.12)}
  button.active{background:rgba(255,255,255,.2)}
  .task{width:auto;padding:0 10px;height:32px;background:#0d9488;color:#fff;font-size:12px;font-weight:700;border-radius:10px}
  .task:hover{background:#14b8a6}
  .stop{width:auto;padding:0 12px;height:32px;background:#e11d48;color:#fff;font-size:12px;font-weight:700;gap:6px;border-radius:10px}
  .stop:hover{background:#fb7185}
  .drag{width:22px;height:34px;display:flex;align-items:center;justify-content:center;
    color:rgba(255,255,255,.35);cursor:grab;font-size:12px;letter-spacing:-1px}
  .warn{position:absolute;bottom:4px;left:10px;right:10px;font-size:10px;color:#fcd34d;display:none}
  body.lost .warn{display:block}
</style></head>
<body class="${showCamera ? '' : 'cam-hidden'}">
  <div class="hud" data-testid="recording-controls-toolbar">
    ${showCamera ? `<div class="cam-wrap" id="camWrap" title="Camera">
      <video id="cam" autoplay muted playsinline></video>
      <div class="cam-off">Camera off</div>
    </div>` : ''}
    <div class="side">
      <div class="meta">
        <span class="drag" title="Drag this window onto the screen you are recording">⠿</span>
        <span class="dot" id="dot"></span>
        <div>
          <div class="lbl" id="lbl">Rec</div>
          <div class="tm" id="tm">00:00</div>
        </div>
      </div>
      <div class="row">
        <button type="button" id="pause" title="Pause">⏸</button>
        <button type="button" id="restart" title="Restart">↺</button>
        <button type="button" id="mic" title="Mic">🎙</button>
        <button type="button" id="cam" title="Cam">📷</button>
        <button type="button" class="task" id="task" title="Start task">＋ Task</button>
        <button type="button" class="stop" id="stop">■ Stop</button>
      </div>
    </div>
  </div>
  <div class="warn" id="warn">Lost connection — use the browser Stop sharing bar.</div>
  <script>
    const fmt = (s) => {
      const n = Math.max(0, Math.floor(s || 0));
      return String(Math.floor(n/60)).padStart(2,'0') + ':' + String(n%60).padStart(2,'0');
    };
    const api = () => {
      try { return (window.opener && window.opener.__tskRecorderApi) || window.__tskRecorderApi || null; }
      catch { return null; }
    };
    const stream = () => {
      try { return (window.opener && window.opener.__tskCameraStream) || window.__tskCameraStream || null; }
      catch { return window.__tskCameraStream || null; }
    };
    const call = (fn) => { try { const a = api(); if (a && typeof a[fn]==='function') a[fn](); } catch {} };
    document.getElementById('pause').onclick = () => call('pauseResume');
    document.getElementById('restart').onclick = () => call('restart');
    document.getElementById('mic').onclick = () => call('toggleMic');
    document.getElementById('cam').onclick = () => call('toggleCam');
    document.getElementById('task').onclick = () => call('startTask');
    document.getElementById('stop').onclick = () => { call('stop'); setTimeout(() => { try { window.close(); } catch {} }, 250); };
    const v = document.getElementById('cam');
    const attachCam = () => {
      if (!v) return;
      const s = stream();
      if (s && v.srcObject !== s) {
        v.srcObject = s;
        v.play().catch(() => {});
      }
    };
    setInterval(() => {
      const a = api();
      const body = document.body;
      if (!a || !a.getState) { body.classList.add('lost'); return; }
      body.classList.remove('lost');
      const s = a.getState() || {};
      document.getElementById('tm').textContent = fmt(s.seconds);
      document.getElementById('lbl').textContent = s.paused ? 'Paused' : 'Rec';
      document.getElementById('dot').className = 'dot' + (s.paused ? ' paused' : '');
      document.getElementById('mic').classList.toggle('active', !s.micOn);
      document.getElementById('cam').classList.toggle('active', !s.camOn);
      body.classList.toggle('cam-off', s.camOn === false);
      attachCam();
      if (s.recording === false) { try { window.close(); } catch {} }
    }, 250);
    attachCam();
  </script>
</body></html>`;

const wireHudDocument = (doc, { showCamera }) => {
    doc.open();
    doc.write(renderHudHtml({ showCamera }));
    doc.close();
    try { doc.title = ' '; } catch { /* noop */ }
    try {
        doc.defaultView.__tskRecorderApi = window.__tskRecorderApi;
        doc.defaultView.__tskCameraStream = window.__tskCameraStream;
        const sync = setInterval(() => {
            try {
                if (!doc.defaultView || doc.defaultView.closed) { clearInterval(sync); return; }
                doc.defaultView.__tskRecorderApi = window.__tskRecorderApi;
                doc.defaultView.__tskCameraStream = window.__tskCameraStream;
            } catch { clearInterval(sync); }
        }, 400);
    } catch { /* noop */ }
};

/**
 * Open a single movable HUD (camera + controls) via Document PiP when the
 * in-tab pill would not sit on the recorded surface.
 * @returns {{ mode: 'pip'|'none', win: Window|null, placedOnOtherDisplay: boolean, reason?: string }}
 */
export async function openRecordingHudOverlay({
    stream = null,
    trackSettings = {},
    needed = true,
    showCamera = true,
} = {}) {
    closeRecordingHudOverlay();

    const screens = await listScreens();
    const { screen, reason } = matchScreenToCapture(trackSettings || {}, screens);
    const placedOnOtherDisplay = !!(screen && !screen.isCurrent);

    if (stream) {
        try { window.__tskCameraStream = stream; } catch { /* noop */ }
    }

    const wantCamera = !!(showCamera && stream);
    if (!needed && !placedOnOtherDisplay) {
        return { mode: 'none', win: null, placedOnOtherDisplay: false, reason };
    }

    try {
        if (window.documentPictureInPicture?.requestWindow) {
            try { window.documentPictureInPicture.window?.close?.(); } catch { /* noop */ }
            const pip = await window.documentPictureInPicture.requestWindow({
                width: wantCamera ? 360 : 440,
                height: wantCamera ? 128 : 56,
                disallowReturnToOpener: true,
            });
            wireHudDocument(pip.document, { showCamera: wantCamera });
            try { window.__tskRecHudWin = pip; } catch { /* noop */ }
            // Also alias for older close helpers
            try { window.__tskRecControlsWin = pip; } catch { /* noop */ }
            try { window.__tskCameraOverlayWin = pip; } catch { /* noop */ }
            return {
                mode: 'pip',
                win: pip,
                placedOnOtherDisplay,
                reason,
            };
        }
    } catch (e) {
        console.warn('Document PiP recording HUD unavailable', e);
    }

    // Do not fall back to window.open — Chrome draws that as a shortened tab.
    return { mode: 'none', win: null, placedOnOtherDisplay, reason };
}

export function setHudCameraVisible(visible) {
    const win = window.__tskRecHudWin || window.__tskCameraOverlayWin;
    try {
        if (win?.document?.body) {
            win.document.body.classList.toggle('cam-off', !visible);
        }
    } catch { /* noop */ }
}

export function closeRecordingHudOverlay() {
    try { window.__tskRecHudWin?.close?.(); } catch { /* noop */ }
    try { window.__tskRecControlsWin?.close?.(); } catch { /* noop */ }
    try { window.__tskCameraOverlayWin?.close?.(); } catch { /* noop */ }
    try { window.documentPictureInPicture?.window?.close?.(); } catch { /* noop */ }
    try { delete window.__tskRecHudWin; } catch { /* noop */ }
    try { delete window.__tskRecControlsWin; } catch { /* noop */ }
    try { delete window.__tskCameraOverlayWin; } catch { /* noop */ }
    try { delete window.__tskCameraStream; } catch { /* noop */ }
}

export function recordingOverlayNeeded(displaySurface, screen) {
    if (displaySurface === 'window' || displaySurface === 'browser') return true;
    if (displaySurface === 'monitor') return true;
    return !!(screen && !screen.isCurrent);
}
