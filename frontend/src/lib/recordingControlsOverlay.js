/**
 * Always-on-top recording controls for when the user is presenting another tab/window.
 * Prefers Document Picture-in-Picture (Chrome). Avoids a tiny popup window —
 * those look like a shortened Chrome tab because the browser draws tab chrome.
 */

const renderControlsHtml = () => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title> </title>
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:#111827;overflow:hidden;
    font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .bar{display:flex;align-items:center;gap:4px;width:100%;height:100%;box-sizing:border-box;
    padding:6px 8px 6px 12px;background:#111827;color:#fff}
  .dot{width:8px;height:8px;border-radius:50%;background:#fb7185;flex-shrink:0}
  .dot.paused{background:#fcd34d}
  .meta{min-width:58px;line-height:1.05;margin-right:4px}
  .meta .lbl{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.42)}
  .meta .tm{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;font-weight:600}
  button{appearance:none;border:0;background:transparent;color:rgba(255,255,255,.9);
    width:34px;height:34px;border-radius:10px;cursor:pointer;display:inline-flex;
    align-items:center;justify-content:center}
  button:hover{background:rgba(255,255,255,.1)}
  button.active{background:rgba(255,255,255,.18)}
  .task{width:auto;padding:0 10px;height:32px;background:#0d9488;color:#fff;font-size:12px;font-weight:700;border-radius:10px}
  .task:hover{background:#14b8a6}
  .stop{width:auto;padding:0 12px;height:32px;background:#e11d48;color:#fff;font-size:12px;font-weight:700;gap:6px;border-radius:10px}
  .stop:hover{background:#fb7185}
  .warn{position:absolute;bottom:2px;left:8px;right:8px;font-size:10px;color:#fcd34d}
</style></head>
<body>
  <div class="bar" data-testid="recording-controls-toolbar">
    <span class="dot" id="dot"></span>
    <div class="meta"><div class="lbl" id="lbl">Rec</div><div class="tm" id="tm">00:00</div></div>
    <button type="button" id="pause" title="Pause">⏸</button>
    <button type="button" id="restart" title="Restart">↺</button>
    <button type="button" id="mic" title="Mic">🎙</button>
    <button type="button" id="cam" title="Cam">📷</button>
    <button type="button" class="task" id="task" title="Start task">＋ Task</button>
    <button type="button" class="stop" id="stop">■ Stop</button>
  </div>
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
    try { doc.title = ' '; } catch { /* noop */ }
    try {
        doc.defaultView.__tskRecorderApi = window.__tskRecorderApi;
        const sync = setInterval(() => {
            try {
                if (!doc.defaultView || doc.defaultView.closed) { clearInterval(sync); return; }
                doc.defaultView.__tskRecorderApi = window.__tskRecorderApi;
            } catch { clearInterval(sync); }
        }, 400);
    } catch { /* noop */ }
};

/**
 * Open always-on-top controls only when the in-tab pill is not on the recorded surface.
 * Returns { mode: 'pip'|'none', win }.
 */
export async function openRecordingControlsOverlay({ needed = true } = {}) {
    if (!needed) return { mode: 'none', win: null };

    try {
        if (window.documentPictureInPicture?.requestWindow) {
            try { window.documentPictureInPicture.window?.close?.(); } catch { /* noop */ }
            const pip = await window.documentPictureInPicture.requestWindow({
                width: 440,
                height: 56,
                disallowReturnToOpener: true,
            });
            wirePipDocument(pip.document);
            try { window.__tskRecControlsWin = pip; } catch { /* noop */ }
            return { mode: 'pip', win: pip };
        }
    } catch (e) {
        console.warn('Document PiP controls unavailable', e);
    }

    // Do not fall back to window.open — Chrome draws that as a shortened tab.
    return { mode: 'none', win: null };
}

export function closeRecordingControlsOverlay() {
    try { window.__tskRecControlsWin?.close?.(); } catch { /* noop */ }
    try { window.documentPictureInPicture?.window?.close?.(); } catch { /* noop */ }
    try { delete window.__tskRecControlsWin; } catch { /* noop */ }
}

export function recordingOverlayNeeded(displaySurface, screen) {
    if (displaySurface === 'window' || displaySurface === 'browser') return true;
    // Entire screen — they will leave TskFlow, so keep a toolbar over other apps.
    if (displaySurface === 'monitor') return true;
    return !!(screen && !screen.isCurrent);
}
