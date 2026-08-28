"""Team email chips stay readable in dark mode (not white-on-white)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_picker_uses_dedicated_chip_class():
    src = _read("components", "TeamPeoplePicker.js")
    assert "team-email-chip" in src
    assert 'data-testid="team-email-chip"' in src
    assert "bg-slate-100 text-slate-700" not in src


def test_dark_slate_100_is_a_dark_fill():
    css = _read("App.css")
    assert '[data-theme="dark"] .bg-slate-100' in css
    block = css.split('[data-theme="dark"] .bg-slate-100')[1].split("}")[0]
    assert "#262626" in block
    assert "#ffffff" not in block
    assert "#f8fafc" not in block


def test_team_email_chip_dark_text_contrasts_fill():
    css = _read("App.css")
    assert ".team-email-chip" in css
    dark = css.split('[data-theme="dark"] .team-email-chip')[1].split("}")[0]
    assert "#2a2a2a" in dark
    assert "#f4f4f5" in dark
    assert "-webkit-text-fill-color" in dark
