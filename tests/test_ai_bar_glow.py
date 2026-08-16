"""Subtle reactive glow around the bottom AI command bar."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCK = (ROOT / "frontend/src/components/GlobalAIDock.js").read_text()
CSS = (ROOT / "frontend/src/index.css").read_text()


def test_glow_layer_sits_behind_the_bar():
    assert 'data-testid="ai-bar-glow"' in DOCK
    assert 'className="ai-bar-glow"' in DOCK
    assert "aria-hidden" in DOCK
    assert ".ai-bar-glow" in CSS
    assert "pointer-events: none" in CSS
    assert "z-index: -1" in CSS
    assert "isolation: isolate" in CSS


def test_glow_follows_pointer_and_brightens_on_type():
    assert "setGlowPoint" in DOCK
    assert "onPointerMove={setGlowPoint}" in DOCK
    assert "--glow-x" in DOCK
    assert "--glow-y" in DOCK
    assert "markTyping" in DOCK
    assert "onInput={markTyping}" in DOCK
    assert "is-typing" in DOCK
    assert "is-hover" in DOCK
    assert "is-focused" in DOCK
    assert ".ai-command-dock.is-typing" in CSS
    assert "--glow-strength" in CSS


def test_glow_timer_hook_is_not_conditional():
    cleanup = "useEffect(() => () => window.clearTimeout(typingTimer.current)"
    assert cleanup in DOCK
    assert DOCK.index(cleanup) < DOCK.index("if (!visible) return null")


def test_glow_stays_subtle_and_respects_reduced_motion():
    assert "radial-gradient" in CSS
    assert "ai-bar-breathe" in CSS
    assert "prefers-reduced-motion" in CSS
    assert "animation: none" in CSS
    # Keep the idle halo faint so it draws the eye without dominating the page.
    assert "--glow-strength: 0.28" in CSS
    assert "--glow-strength: 0.62" in CSS
