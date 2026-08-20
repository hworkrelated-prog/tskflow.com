"""Overdue task-card badge stays solid and readable in dark theme."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_overdue_badge_uses_solid_chip_class():
    card = _read("components", "TaskCard.js")
    group = _read("components", "ParentTaskGroup.js")
    css = _read("App.css")
    assert 'className="overdue-badge"' in card
    assert 'className="overdue-badge"' in group
    assert "bg-red-50 text-red-700 border border-red-200" not in card
    assert "bg-red-50 text-red-700 border border-red-200" not in group
    assert ".overdue-badge" in css
    assert '[data-theme="dark"] .overdue-badge' in css
    dark = css.split('[data-theme="dark"] .overdue-badge')[1].split("}")[0]
    assert "#e11d48" in dark or "#dc2626" in dark
    assert "#ffffff" in dark or "color: #fff" in dark.replace(" ", "")
