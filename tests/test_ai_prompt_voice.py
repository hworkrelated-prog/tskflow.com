"""AI prompt bar: voice send + no overlapping Jarvis FAB."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_composer_has_voice_mic_that_auto_sends():
    src = _read("components", "AIQuickCreate.js")
    helper = _read("lib", "promptVoice.js")
    voice = _read("components", "VoiceMode.js")
    assert 'data-testid="ai-prompt-voice-btn"' in src
    assert "createDictationSession" in src
    assert "createDictationSession" in voice
    assert "createDictationSession" in helper
    assert "webkitSpeechRecognition" in helper
    assert "runPreviewRef.current" in src
    assert "Speak to send" in src
    assert "is-listening" in src
    assert "MicOff" in src
    assert "needsIosScreenRecordFlow" in src
    assert "startVoice()" in src.split("const startComposerRecording")[1].split("const runQA")[0]
    # Send stays tappable while the mic is up (iOS users otherwise get stuck).
    send = src.split('data-testid="ai-quick-preview-btn"')[0].rsplit("<button", 1)[-1]
    assert "listening || !text.trim()" not in send
    assert "finishVoiceSession({ send: true })" in send
    # Toolbar is a real row, not an overlay sitting on the field.
    assert "absolute bottom-2 left-2 right-2" not in src


def test_voice_sends_when_transcript_stops_changing():
    """Prompt and Jarvis voice share one dictation session."""
    helper = _read("lib", "promptVoice.js")
    create = _read("components", "AIQuickCreate.js")
    voice = _read("components", "VoiceMode.js")
    assert "VOICE_UTTERANCE_MS = 1600" in helper or "VOICE_UTTERANCE_MS = 1_600" in helper
    assert "VOICE_SILENCE_MS = 20_000" in helper or "VOICE_SILENCE_MS = 20000" in helper
    assert "collectRecognitionSpeech" in helper
    assert "spoken !== heard" in helper
    assert "createDictationSession" in create
    assert "createDictationSession" in voice
    assert "rec.continuous = false" not in create
    assert "rec.continuous = false" not in voice
    assert "rec.continuous = true" in helper


def test_voice_releases_mic_on_exit_and_background():
    """Closing the dock or leaving the tab must abort recognition, not restart it."""
    helper = _read("lib", "promptVoice.js")
    create = _read("components", "AIQuickCreate.js")
    voice = _read("components", "VoiceMode.js")
    assert "tearDownSpeechRecognition" in helper
    assert "rec.onend = null" in helper
    assert "rec.abort()" in helper
    assert "VOICE_RESTART_MS" in helper
    assert "createDictationSession" in create
    assert "stopVoice()" in create.split("const reset = useCallback")[1].split("}, [focusInput, stopVoice]")[0]
    assert "pagehide" in create
    assert "visibilitychange" in create
    assert "createDictationSession" in voice
    onend = helper.split("next.onend = () => {")[1].split("try {")[0]
    assert "setTimeout" in onend
    assert "next.start();" not in onend.split("setTimeout")[0]


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
import {
  composeVoiceSubmit,
  shouldAutoSendVoice,
  collectRecognitionSpeech,
  resolveVoiceSubmit,
  createSilenceWatch,
  VOICE_SILENCE_MS,
  VOICE_UTTERANCE_MS,
  createDictationSession,
  tearDownSpeechRecognition,
} from './frontend/src/lib/promptVoice.js';
if (VOICE_SILENCE_MS < 15000 || VOICE_SILENCE_MS > 30000) {
  console.error('silence window out of 15–30s range', VOICE_SILENCE_MS);
  process.exit(2);
}
if (VOICE_UTTERANCE_MS < 800 || VOICE_UTTERANCE_MS > 2500) {
  console.error('utterance settle out of range', VOICE_UTTERANCE_MS);
  process.exit(8);
}
const iosInterim = collectRecognitionSpeech([
  { 0: { transcript: 'I have to meet up with Sophia today to discuss David' }, isFinal: false },
]);
const mixed = collectRecognitionSpeech([
  { 0: { transcript: 'assign this to Harold' }, isFinal: true },
  { 0: { transcript: ' tomorrow morning' }, isFinal: false },
]);
const cases = [
  [composeVoiceSubmit('', 'assign this to Harold'), 'assign this to Harold'],
  [composeVoiceSubmit('follow up', 'with Harold tomorrow'), 'follow up with Harold tomorrow'],
  [composeVoiceSubmit('  ', '  '), ''],
  [shouldAutoSendVoice('go to analytics'), true],
  [shouldAutoSendVoice('a'), false],
  [shouldAutoSendVoice(''), false],
  [iosInterim.spoken, 'I have to meet up with Sophia today to discuss David'],
  [iosInterim.finalText, ''],
  [mixed.spoken, 'assign this to Harold tomorrow morning'],
  [resolveVoiceSubmit({ seed: '', spoken: iosInterim.spoken, displayed: iosInterim.spoken }), iosInterim.spoken],
  [resolveVoiceSubmit({ seed: '', spoken: '', displayed: iosInterim.spoken }), iosInterim.spoken],
  [resolveVoiceSubmit({ seed: 'typed first', spoken: '', displayed: 'typed first' }), ''],
  [resolveVoiceSubmit({ seed: 'follow up', spoken: 'with Harold' }), 'follow up with Harold'],
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

const fakeRec = {
  start() { fakeRec.started = true; },
  abort() { fakeRec.aborted = true; },
  stop() { fakeRec.stopped = true; },
};
let committed = '';
const session = createDictationSession({
  createRecognition: () => fakeRec,
  getDisplayed: () => '',
  getSeed: () => '',
  utteranceMs: 40,
  silenceMs: 5000,
});
const started = session.start({ onCommit: (t) => { committed = t; } });
if (!started.started) { console.error('session did not start'); process.exit(9); }
fakeRec.onresult({
  results: [{ 0: { transcript: 'I have to meet up with Sophia today to discuss David' }, isFinal: false }],
});
fakeRec.onresult({
  results: [{ 0: { transcript: 'I have to meet up with Sophia today to discuss David' }, isFinal: false }],
});
await new Promise((r) => setTimeout(r, 20));
if (committed) { console.error('committed too early', committed); process.exit(10); }
await new Promise((r) => setTimeout(r, 40));
if (committed !== 'I have to meet up with Sophia today to discuss David') {
  console.error('expected iOS interim commit', committed);
  process.exit(11);
}
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
