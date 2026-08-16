"""Mobile AI bar: example text stays in the field; glow does not ghost the page."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_placeholder_cannot_cover_toolbar_icons():
    src = _read("components", "AIQuickCreate.js")
    css = _read("index.css")
    field = css.split(".ai-prompt-field")[1].split(".ai-prompt-placeholder")[0]
    placeholder = css.split(".ai-prompt-placeholder {")[1].split(".ai-prompt-placeholder-fade")[0]
    assert "ai-prompt-field" in src
    assert 'data-testid="ai-prompt-placeholder"' in src
    assert "overflow: hidden" in field
    assert "text-overflow: ellipsis" in placeholder
    assert "white-space: nowrap" in placeholder
    assert "transform: translateY(5px)" not in css
    assert "right: 7rem" not in placeholder
    assert "-webkit-line-clamp: 2" not in placeholder
    assert "relative z-[1]" in src


def test_mobile_glow_does_not_spill_around_jarvis():
    css = _read("index.css")
    phone = css.split(".ai-bottom-stage .ai-jarvis-orb")[1]
    assert "inset: -4px" in phone
    assert "background: none" in phone
    assert "display: none" in phone
    assert "overflow: hidden" in phone
    inset = css.split(".ai-composer-shell--inset")[1].split("}")[0]
    assert "background: rgba(248, 250, 252, 0.9)" not in inset
    assert "background: #f8fafc" in inset
    assert "box-shadow: 0 4px 12px rgba(15, 23, 42, 0.16)" in css
