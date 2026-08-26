"""Clicking the floating AI bar must not flicker closed, then open."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCK = (ROOT / "frontend/src/components/GlobalAIDock.js").read_text(encoding="utf-8")
CSS = (ROOT / "frontend/src/index.css").read_text(encoding="utf-8")


def test_opening_ignores_stale_unfocused_snapshots():
    assert "openingRef" in DOCK
    src = DOCK.split("const handleSnapshot")[1].split("const openManual")[0]
    assert "openingRef.current" in src
    assert "setFocused(false)" in src
    assert "if (snap?.focused)" in src
    assert "else if (!openingRef.current)" in src


def test_click_open_does_not_add_pulse_class():
    expand = DOCK.split("const expandFromFab")[1].split("return (")[0]
    assert "ai-dock-pulse" not in expand
    assert "requestAnimationFrame" in expand
    assert "setFocused(true)" in expand
    assert "setActive(true)" in expand


def test_morph_eases_width_without_height_collapse():
    assert "width 400ms cubic-bezier(0.22, 1, 0.36, 1)" in CSS
    open_panel = CSS.split(".ai-command-dock.is-open .ai-dock-panel {")[1].split("}")[0]
    assert "min-height: 0" not in open_panel
    fab_open = CSS.split(".ai-command-dock.is-open .ai-dock-fab {")[1].split("}")[0]
    assert "scale(0.72)" not in fab_open
    assert "pointer-events: none" in fab_open
