/**
 * Always-on-top recording controls for when the user is presenting another tab/window.
 * Prefers Document Picture-in-Picture (Chrome), then a small popup window
 * placed on the captured display when we know which one that is.
 */

import { popupBoxOnScreen, fallbackScreens } from '@/lib/recordingDisplay';

const POPUP_NAME = 'tsk_recording_controls';

const renderControlsHtml = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Recording</title>
<style>
  html,body{margin:0;padding:0;background:#0f172a;overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .bar{display:flex;align-items:center;gap:6px;padding:6px 8px;height:100vh;box-sizing:border-box}
  .pill{display:flex;align-items:center;gap:8px;width:100%;background:rgba(2,6,23,.55);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 6px 4px 10px;color:#fff}
  .dot{width:8px;height:8px;border-radius:50%;background:#fb7185;flex-shrink:0}
  .dot.paused{background:#fcd34d}
  .meta{min-width:64px;line-height:1.1}
  .meta .lbl{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.45)}
  .meta .tm{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:600}
  button{appearance:none;border:0;background:transparent;color:rgba(255,255,255,.88);width:32px;height:32px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
  button:hover{background:rgba(255,255,255,.12)}
  button.active{background:rgba(255,255,255,.2)}
  .stop{width:auto;padding:0 12px;height:32px;background:rgba(244,63,94,.9);color:#fff;font-size:12px;font-weight:700;gap:6px}
  .stop:hover{background:#fb7185}
  .warn{position:absolute;bottom:2px;left:8px;right:8px;font-size:10px;color:#fcd34d}
</style></head>
<body>
  <div class="bar"><div class="pill">
    <span class="dot" id="dot"></span>
    <div class="meta"><div class="lbl" id="lbl">Rec</div><div class="tm" id="tm">00:00</div></div>
    <button type="button" id="pause" title="Pause">⏸</button>
    <button type="button" id="restart" title="Restart">↺</button>
    <button type="button" id="mic" title="Mic">🎙</button>
    <button type="button" id="cam" title="Cam">📷</button>
    <button type="button" id="task" title="Start task" style="width:auto;padding:0 10px;height:32px;background:rgba(13,148,136,.92);color:#fff;font-size:12px;font-weight:700">＋ Task</button>
    <button type="button" class="stop" id="stop">■ Stop</button>
  </div></div>
  <div class="warn" id="warn" hidden>Lost connection — use the browser Stop sharing bar.</div>
  <script>
    const fmt = (s) => {
      const n = Math.max(0, Math.floor(s || 0));
      return String(Math.floor(n/60)).padStart(2,'0') + ':' + String(n%60).padStart(2,'0');
    };
    const api = () => {
      try { return (window.opener && window.opener.__tskRecorderApi) || window.__tskRecorderApi || null; }
      catch { return null; }
    };
    const call = (fn) => { try { const a = api(); if (a && typeof a[fn]==='function') a[fn](); } catch {} };
    document.getElementById('pause').onclick = () => call('pauseResume');
    document.getElementById('restart').onclick = () => call('restart');
    document.getElementById('mic').onclick = () => call('toggleMic');
    document.getElementById('cam').onclick = () => call('toggleCam');
    document.getElementById('task').onclick = () => call('startTask');
    document.getElementById('stop').onclick = () => { call('stop'); setTimeout(() => { try { window.close(); } catch {} }, 250); };
    setInterval(() => {
      const a = api();
      const warn = document.getElementById('warn');
      if (!a || !a.getState) { warn.hidden = false; return; }
      warn.hidden = true;
      const s = a.getState() || {};
      document.getElementById('tm').textContent = fmt(s.seconds);
      document.getElementById('lbl').textContent = s.paused ? 'Paused' : 'Rec';
      document.getElementById('dot').className = 'dot' + (s.paused ? ' paused' : '');
      document.getElementById('mic').classList.toggle('active', !s.micOn);
      document.getElementById('cam').classList.toggle('active', !s.camOn);
      if (s.recording === false) { try { window.close(); } catch {} }
    }, 250);
  </script>
</body></html>`;

const wirePipDocument = (doc) => {
    doc.open();
    doc.write(renderControlsHtml());
    doc.close();
    // PiP windows don't have opener — expose API on the pip window itself via parent
    try {
        doc.defaultView.__tskRecorderApi = window.__tskRecorderApi;
        // Keep syncing reference
        const sync = setInterval(() => {
            try {
                if (!doc.defaultView || doc.defaultView.closed) { clearInterval(sync); return; }
                doc.defaultView.__tskRecorderApi = window.__tskRecorderApi;
            } catch { clearInterval(sync); }
        }, 400);
    } catch { /* noop */ }
};

/**
 * Open always-on-top controls. Returns { mode: 'pip'|'popup'|'none', win }.
 * Pass `screen` (from matchScreenToCapture) to park the popup on that display.
 */
export async function openRecordingControlsOverlay({ screen } = {}) {
    // 1) Document Picture-in-Picture — floats over other tabs/apps in Chromium
    try {
        if (window.documentPictureInPicture?.requestWindow) {
            // Close prior PiP if any
            try { window.documentPictureInPicture.window?.close?.(); } catch { /* noop */ }
            const pip = await window.documentPictureInPicture.requestWindow({
                width: 420,
                height: 64,
            });
            wirePipDocument(pip.document);
            try { window.__tskRecControlsWin = pip; } catch { /* noop */ }
            return { mode: 'pip', win: pip };
        }
    } catch (e) {
        console.warn('Document PiP controls unavailable', e);
    }

    // 2) Classic popup window — on the captured display when we know it
    try {
        const target = screen || fallbackScreens()[0];
        const box = popupBoxOnScreen(target, {
            width: 420,
            height: 72,
            corner: 'top-right',
            margin: 24,
        });
        const w = window.open('/recording/controls', POPUP_NAME, box.features);
        if (w) {
            try { window.__tskRecControlsWin = w; } catch { /* noop */ }
            try { w.focus(); } catch { /* noop */ }
            return { mode: 'popup', win: w };
        }
    } catch { /* noop */ }

    return { mode: 'none', win: null };
}

export function closeRecordingControlsOverlay() {
    try { window.__tskRecControlsWin?.close?.(); } catch { /* noop */ }
    try { window.documentPictureInPicture?.window?.close?.(); } catch { /* noop */ }
    try { delete window.__tskRecControlsWin; } catch { /* noop */ }
}
