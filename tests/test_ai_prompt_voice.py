"""AI prompt bar: voice send + no overlapping Jarvis FAB."""
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
    assert "voiceFinalRef" in src
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
