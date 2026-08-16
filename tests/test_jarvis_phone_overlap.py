"""Jarvis lives in the prompt bar, not as a separate orb beside it."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "frontend/src/App.js").read_text()
DOCK = (ROOT / "frontend/src/components/GlobalAIDock.js").read_text()
CREATE = (ROOT / "frontend/src/components/AIQuickCreate.js").read_text()
VOICE = (ROOT / "frontend/src/components/VoiceMode.js").read_text()
CSS = (ROOT / "frontend/src/index.css").read_text()


def test_prompt_and_jarvis_share_a_bottom_stage():
    assert 'data-testid="ai-bottom-stage"' in APP
    assert "<VoiceMode dockIntegrated />" in APP
    assert "<GlobalAIDock />" in APP
    assert APP.index("<VoiceMode dockIntegrated />") < APP.index("<GlobalAIDock />")
    assert ".ai-bottom-stage" in CSS
    assert "flex-direction: column" in CSS
    assert "column-reverse" not in CSS
    assert "pointer-events: none" in CSS


def test_jarvis_is_not_a_prompt_button():
    assert 'data-testid="ai-jarvis-mark"' not in CREATE
    assert "JarvisIcon" not in CREATE
    assert "Jarvis lives in the prompt bar" in VOICE
    assert "return null" in VOICE.split("Jarvis lives in the prompt bar")[1][:220]
    assert "flex-direction: row-reverse" not in CSS
    assert "max-width: 40rem" in CSS


def test_dock_does_not_self_center_with_fixed_offset():
    assert "fixed left-1/2" not in DOCK
    assert "translateX(-50%)" not in CSS.split(".ai-bottom-stage")[1].split(".ai-prompt-field")[0]
    assert "margin-left: auto" in CSS
    assert ".ai-bottom-stage" in CSS
