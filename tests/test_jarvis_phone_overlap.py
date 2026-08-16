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
    beside = from_right >= size + gap + 8
    if beside:
        return "beside", right + gap, max(8, bottom - size)
    return "above", max(8, right - size), max(8, top - gap - size)


def test_phone_parks_jarvis_above_the_bar():
    # 390×844 phone, 96vw bar centered (~8px side gutters), ~120px tall bar.
    placement, left, top = _eval_anchor(390, 844, 8, 708, 382, 828)
    assert placement == "above"
    assert left == 382 - 44
    # Orb sits fully above the bar with a gap — not on the Go button.
    assert top + 44 <= 708
    assert 708 - (top + 44) >= 10


def test_wide_desktop_sits_jarvis_beside_the_bar():
    # 1280×800, 40rem bar centered, plenty of side room.
    placement, left, top = _eval_anchor(1280, 800, 320, 680, 960, 784)
    assert placement == "beside"
    assert left == 960 + 16
    assert top == 784 - 44


def test_dock_publishes_measured_anchor():
    assert "jarvisAnchorFromDock" in DOCK
    assert "ResizeObserver" in DOCK
    assert "dockRef" in DOCK
    assert "--ai-jarvis-left" in ANCHOR
    assert "--ai-jarvis-top" in ANCHOR


def test_voice_widget_uses_anchor_instead_of_guessed_offset():
    assert "ai-jarvis-anchor" in VOICE
    assert "7.5rem" not in VOICE
    assert "ai-jarvis-orb" in VOICE
    assert ".ai-jarvis-anchor" in CSS
    assert "html.ai-jarvis-above" in CSS
    assert "html.ai-jarvis-beside" in CSS
