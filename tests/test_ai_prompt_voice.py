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
    assert "Speak — sends when you finish" in src
    assert "is-listening" in src
    # Toolbar is a real row, not an overlay sitting on the field.
    assert "absolute bottom-2 left-2 right-2" not in src


def test_voice_fab_does_not_overlap_prompt():
    app = _read("App.js")
    assert "VoiceMode" not in app
    assert "voice-mode-fab" not in app


def test_analytics_metrics_stack_on_mobile():
    src = _read("pages", "AnalyticsPage.js")
    assert 'data-testid="analytics-assignee-mobile"' in src
    assert "md:hidden" in src
    assert "hidden md:block" in src
    assert "formatAvgResponse" in src


def test_voice_submit_helper_auto_sends_spoken_text():
    script = r"""
import { composeVoiceSubmit, shouldAutoSendVoice } from './frontend/src/lib/promptVoice.js';
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
