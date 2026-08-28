"""AI prompt bar: voice send + no overlapping Jarvis FAB."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_composer_has_voice_mic_that_auto_sends():
    src = _read("components", "AIQuickCreate.js")
    assert 'data-testid="ai-prompt-voice-btn"' in src
    assert "getSpeechRecognition" in src
    assert "webkitSpeechRecognition" in src
    assert "runPreviewRef.current" in src
    assert "shouldAutoSendVoice" in src
    assert "composeVoiceSubmit" in src
    assert "createSilenceWatch" in src
    assert "VOICE_SILENCE_MS" in src
    assert "continuous = true" in src
    assert "Speak - stays on through pauses" in src
    assert "is-listening" in src
    # Toolbar is a real row, not an overlay sitting on the field.
    assert "absolute bottom-2 left-2 right-2" not in src


def test_voice_keeps_listening_through_contemplative_pauses():
    """Mic must not hang up on short pauses — only after ~15–30s of silence."""
    helper = _read("lib", "promptVoice.js")
    create = _read("components", "AIQuickCreate.js")
    voice = _read("components", "VoiceMode.js")
    assert "VOICE_SILENCE_MS = 20_000" in helper or "VOICE_SILENCE_MS = 20000" in helper
    assert "createSilenceWatch" in helper
    assert "silence.bump()" in create
    assert "voiceWantRef" in create
    assert "continuous = true" in create
    assert "continuous = true" in voice
    assert "createSilenceWatch" in voice
    # Must not use the old short-session mode.
    assert "rec.continuous = false" not in create
    assert "rec.continuous = false" not in voice


def test_voice_releases_mic_on_exit_and_background():
    """Closing the dock or leaving the tab must abort recognition, not restart it."""
    helper = _read("lib", "promptVoice.js")
    create = _read("components", "AIQuickCreate.js")
    voice = _read("components", "VoiceMode.js")
    assert "tearDownSpeechRecognition" in helper
    assert "rec.onend = null" in helper
    assert "rec.abort()" in helper
    assert "VOICE_RESTART_MS" in helper
    assert "tearDownSpeechRecognition" in create
    assert "stopVoice()" in create.split("const reset = useCallback")[1].split("}, [focusInput, stopVoice]")[0]
    assert "pagehide" in create
    assert "visibilitychange" in create
    assert "VOICE_RESTART_MS" in create
    assert "tearDownSpeechRecognition" in voice
    assert "VOICE_RESTART_MS" in voice
    onend = create.split("rec.onend = () => {")[1].split("recRef.current = rec")[0]
    assert "setTimeout" in onend
    assert "rec.start();" not in onend.split("setTimeout")[0]


def test_voice_fab_does_not_overlap_prompt():
    app = _read("App.js")
    voice = _read("components", "VoiceMode.js")
    css = (ROOT / "frontend/src/index.css").read_text(encoding="utf-8")
    # Prompt mic is in the composer; integrated VoiceMode keeps shortcuts only (no FAB).
    assert "<VoiceMode dockIntegrated />" in app
    assert 'data-testid="ai-bottom-stage"' in app
    assert "voice-mode-fab" not in app
    assert "Jarvis lives in the prompt bar" in voice
    assert "dockIntegrated" in voice
    assert ".ai-bottom-stage" in css


def test_analytics_metrics_stack_on_mobile():
    src = _read("pages", "AnalyticsPage.js")
    assert 'data-testid="analytics-assignee-mobile"' in src
    assert "md:hidden" in src
    assert "hidden md:block" in src
    assert "formatAvgResponse" in src


def test_voice_submit_helper_auto_sends_spoken_text():
    script = r"""
import { composeVoiceSubmit, shouldAutoSendVoice, createSilenceWatch, VOICE_SILENCE_MS, tearDownSpeechRecognition } from './frontend/src/lib/promptVoice.js';
if (VOICE_SILENCE_MS < 15000 || VOICE_SILENCE_MS > 30000) {
  console.error('silence window out of 15–30s range', VOICE_SILENCE_MS);
  process.exit(2);
}
const cases = [
  [composeVoiceSubmit('', 'assign this to Harold'), 'assign this to Harold'],
  [composeVoiceSubmit('follow up', 'with Harold tomorrow'), 'follow up with Harold tomorrow'],
  [composeVoiceSubmit('  ', '  '), ''],
  [shouldAutoSendVoice('go to analytics'), true],
  [shouldAutoSendVoice('a'), false],
  [shouldAutoSendVoice(''), false],
];
for (const [got, want] of cases) {
  if (got !== want) {
    console.error('mismatch', JSON.stringify(got), JSON.stringify(want));
    process.exit(1);
  }
}
let fired = 0;
const watch = createSilenceWatch({ ms: 30, onSilence: () => { fired += 1; } });
watch.bump();
await new Promise((r) => setTimeout(r, 10));
watch.bump(); // reset before fire
await new Promise((r) => setTimeout(r, 10));
if (fired !== 0) { console.error('fired too early', fired); process.exit(3); }
await new Promise((r) => setTimeout(r, 40));
if (fired !== 1) { console.error('expected one silence fire', fired); process.exit(4); }
watch.clear();
const rec = {
  onresult() {},
  onerror() {},
  onend() { rec.ended = true; },
  abort() { rec.aborted = true; this.onend?.(); },
  stop() { rec.stopped = true; },
};
tearDownSpeechRecognition(rec);
if (rec.onend !== null || rec.onresult !== null || rec.onerror !== null) {
  console.error('handlers not cleared', rec);
  process.exit(5);
}
if (!rec.aborted) { console.error('abort not called'); process.exit(6); }
if (rec.ended) { console.error('onend still fired after teardown'); process.exit(7); }
console.log('ok');
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert "ok" in result.stdout
