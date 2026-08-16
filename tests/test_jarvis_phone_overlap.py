"""Jarvis orb stays clear of the bottom prompt bar on phones."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DOCK = (ROOT / "frontend/src/components/GlobalAIDock.js").read_text()
VOICE = (ROOT / "frontend/src/components/VoiceMode.js").read_text()
CSS = (ROOT / "frontend/src/index.css").read_text()
ANCHOR = (ROOT / "frontend/src/lib/jarvisAnchor.js").read_text()


def _eval_anchor(width, height, left, top, right, bottom):
    """Run the same placement math the frontend uses."""
    size = int(re.search(r"export const JARVIS_SIZE = (\d+)", ANCHOR).group(1))
    gap = int(re.search(r"export const JARVIS_GAP = (\d+)", ANCHOR).group(1))
    from_right = max(0, width - right)
    from_bottom = max(0, height - bottom)
    beside = from_right >= size + gap + 8
    if beside:
        return "beside", max(8, from_right - size - gap), max(8, from_bottom)
    return "above", max(8, from_right), max(8, height - top + gap)


def test_phone_parks_jarvis_above_the_bar():
    # 390×844 phone, 96vw bar centered (~8px side gutters), ~120px tall bar.
    placement, right, bottom = _eval_anchor(390, 844, 8, 708, 382, 828)
    assert placement == "above"
    assert right == 8
    assert bottom >= 844 - 708 + 10
    # Orb sits above the bar, not on the Go button.
    assert bottom > 844 - 708


def test_wide_desktop_sits_jarvis_beside_the_bar():
    # 1280×800, 40rem bar centered, plenty of side room.
    placement, right, bottom = _eval_anchor(1280, 800, 320, 680, 960, 784)
    assert placement == "beside"
    assert right > 8
    assert bottom == 16


def test_dock_publishes_measured_anchor():
    assert "jarvisAnchorFromDock" in DOCK
    assert "ResizeObserver" in DOCK
    assert "dockRef" in DOCK
    assert "--ai-jarvis-right" in ANCHOR
    assert "--ai-jarvis-bottom" in ANCHOR


def test_voice_widget_uses_anchor_instead_of_guessed_offset():
    assert "ai-jarvis-anchor" in VOICE
    assert "7.5rem" not in VOICE
    assert "ai-jarvis-orb" in VOICE
    assert ".ai-jarvis-anchor" in CSS
    assert "html.ai-jarvis-above" in CSS
