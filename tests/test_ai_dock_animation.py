"""Bottom AI bar must ease open instead of snapping upward."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend" / "src"


def _read(*parts: str) -> str:
    return (ROOT.joinpath(*parts)).read_text(encoding="utf-8")


def test_chips_stay_mounted_and_toggle_open_class():
    src = _read("components", "AIQuickCreate.js")
    assert "ai-command-chips-wrap" in src
    assert "showCommandChips" in src
    assert "composerFocused && (" not in src
    assert src.index("ai-command-chips-wrap") < src.index("ai-quick-composer")


def test_dock_panel_uses_animated_active_chrome():
    src = _read("components", "GlobalAIDock.js")
    css = _read("index.css")
    assert "ai-dock-panel" in src
    assert "is-active" in src
    assert "ai-command-chips-wrap" in css
    assert "grid-template-rows" in css
    assert "320ms" in css
    assert "prefers-reduced-motion" in css
