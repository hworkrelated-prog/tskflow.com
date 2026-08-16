"""The bottom AI bar has no glow layer or breathing animation."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCK = (ROOT / "frontend/src/components/GlobalAIDock.js").read_text()
CSS = (ROOT / "frontend/src/index.css").read_text()


def test_glow_layer_is_gone():
    assert 'data-testid="ai-bar-glow"' not in DOCK
    assert "ai-bar-glow" not in DOCK
    assert ".ai-bar-glow" not in CSS
    assert "ai-bar-glow-spot" not in DOCK
    assert ".ai-bar-glow-spot" not in CSS
    assert "ai-bar-breathe" not in CSS
    assert "setGlowPoint" not in DOCK
    assert "--glow-x" not in DOCK
    assert "--glow-strength" not in CSS


def test_active_panel_is_solid_not_glass():
    active = CSS.split(".ai-dock-panel.is-active {")[1].split("}")[0]
    assert "background: #fff" in active
    assert "backdrop-filter" not in active
    assert "transparent" not in active
