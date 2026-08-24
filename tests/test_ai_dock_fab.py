"""Floating center + button morphs into the existing AI prompt panel."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCK = (ROOT / "frontend/src/components/GlobalAIDock.js").read_text(encoding="utf-8")
CSS = (ROOT / "frontend/src/index.css").read_text(encoding="utf-8")
CREATE = (ROOT / "frontend/src/components/AIQuickCreate.js").read_text(encoding="utf-8")


def test_dock_renders_center_fab_and_keeps_quick_create():
    assert 'data-testid="ai-dock-fab"' in DOCK
    assert "aria-label=\"Create a task\"" in DOCK
    assert "<Plus" in DOCK
    assert "<AIQuickCreate" in DOCK
    assert "embedded" in DOCK
    assert "onClick={expandFromFab}" in DOCK
    assert "tskflow:focus-ai-prompt" in DOCK
    # Hover must not expand the dock — click opens; hover only lifts the FAB.
    assert "lockedOpen || hovered" not in DOCK


def test_dock_morphs_from_rounded_fab_using_existing_panel_transition():
    assert ".ai-command-dock.is-collapsed" in DOCK or "is-collapsed" in DOCK
    assert "is-open" in DOCK
    assert "ai-dock-panel" in DOCK
    assert "320ms" in CSS
    assert ".ai-dock-fab" in CSS
    fab = CSS.split("\n.ai-dock-fab {")[1].split("}")[0]
    assert "width: 4.75rem" in fab
    assert "height: 3rem" in fab
    assert "border-radius: 0.95rem" in fab
    assert "9999px" not in fab
    assert "animation: ai-dock-pulse-kf 2.6s ease-in-out infinite" in CSS
    assert "@keyframes ai-dock-pulse-kf" in CSS
    assert "0 0 0 0 rgba(13, 148, 136, 0.4)" in CSS.split("@keyframes ai-dock-pulse-kf")[1]


def test_active_panel_still_opaque():
    active = CSS.split(".ai-dock-panel.is-active {")[1].split("}")[0]
    assert "background: #fff" in active
    assert "ai-bar-glow" not in CSS
    assert "ai-bar-breathe" not in CSS


def test_quick_create_logic_untouched():
    assert "runPreviewRef" in CREATE
    assert "/ai/quick-create-preview" in CREATE or "quick-create-preview" in CREATE
    assert 'data-testid="ai-quick-create"' in CREATE


def test_collapsed_fab_hover_only_lifts_not_expands():
    """Rounded FAB may lift on hover; opening the panel is click-only."""
    assert "onClick={expandFromFab}" in DOCK
    assert "onMouseEnter={handleDockPointerEnter}" not in DOCK
    assert "const open = lockedOpen;" in DOCK or "const open = lockedOpen\n" in DOCK or re_open_locked_only()
    lift = CSS.split(".ai-command-dock.is-collapsed .ai-dock-fab:hover")[1].split("}")[0]
    assert "translateY" in lift
    panel = CSS.split(".ai-dock-panel {")[1].split("}")[0]
    assert "scale(0.92)" not in panel


def re_open_locked_only():
    import re
    return bool(re.search(r"const open = lockedOpen\s*;", DOCK))
