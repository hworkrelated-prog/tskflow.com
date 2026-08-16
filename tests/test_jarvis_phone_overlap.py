"""Jarvis orb stays clear of the bottom prompt bar on phones."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "frontend/src/App.js").read_text()
DOCK = (ROOT / "frontend/src/components/GlobalAIDock.js").read_text()
VOICE = (ROOT / "frontend/src/components/VoiceMode.js").read_text()
CSS = (ROOT / "frontend/src/index.css").read_text()


def test_prompt_and_jarvis_share_a_bottom_stage():
    assert 'data-testid="ai-bottom-stage"' in APP
    assert "<VoiceMode dockIntegrated />" in APP
    assert "<GlobalAIDock />" in APP
    # Jarvis is first in the DOM so column-reverse puts the prompt on the bottom.
    assert APP.index("<VoiceMode dockIntegrated />") < APP.index("<GlobalAIDock />")
    assert ".ai-bottom-stage" in CSS
    assert "flex-direction: column-reverse" in CSS
    assert "pointer-events: none" in CSS


def test_phone_stacks_jarvis_above_the_bar():
    assert "column-reverse" in CSS
    assert "gap: 0.75rem" in CSS
    # No guessed offset that used to cover the Go button.
    assert "7.5rem" not in VOICE
    assert "ai-jarvis-anchor" in VOICE
    assert "ai-jarvis-orb" in VOICE


def test_wide_screens_sit_jarvis_beside_the_bar():
    assert "min-width: 52rem" in CSS
    assert "flex-direction: row-reverse" in CSS
    assert "max-width: 40rem" in CSS


def test_dock_does_not_self_center_with_fixed_offset():
    assert "fixed left-1/2" not in DOCK
    assert "translateX(-50%)" in CSS  # stage is centered, not the dock
    assert ".ai-bottom-stage" in CSS
