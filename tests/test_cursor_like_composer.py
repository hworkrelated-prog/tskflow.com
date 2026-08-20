"""AI composer matches a quiet chat box: plus menu, arrow send, no extra chrome."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FE.joinpath(*parts).read_text(encoding="utf-8")


def test_composer_uses_plus_menu_and_arrow_send():
    src = _read("components", "AIQuickCreate.js")
    toolbar = src[src.index("relative z-[1] flex items-center justify-between") : src.index("ai-inline-recorder")]
    assert 'data-testid="ai-plus-btn"' in toolbar
    assert 'data-testid="ai-record-btn"' in toolbar
    assert 'data-testid="ai-plus-menu"' in toolbar
    assert 'data-testid="ai-screen-record-btn"' in toolbar
    assert 'data-testid="ai-attach-file-btn"' in toolbar
    assert 'data-testid="ai-transcript-btn"' in toolbar
    assert 'data-testid="ai-recurring-btn"' in toolbar
    assert "Repeat" in src
    assert "ArrowUp" in toolbar
    assert 'aria-label="Send"' in toolbar
    assert ">Go<" not in toolbar
    assert "Wand2" not in src
    # Record is one tap away next to +; other extras stay in the plus menu.
    assert toolbar.index("ai-plus-btn") < toolbar.index("ai-record-btn")
    assert toolbar.index("ai-record-btn") < toolbar.index("ai-screen-record-btn")
    assert ">Record</span>" in toolbar


def test_format_toolbar_is_overlay_only_when_open():
    src = _read("components", "AIQuickCreate.js")
    css = _read("index.css")
    assert "{formatOpen ? (" in src
    bar = src[src.index('data-testid="ai-format-toolbar"') - 220 : src.index('data-testid="ai-format-toolbar"') + 120]
    assert "absolute" in bar
    assert "bottom-full" in bar
    assert "top-2" not in bar
    assert "ai-format-toolbar" in bar
    assert "bg-white/95" not in bar
    assert ".ai-format-toolbar" in css
    assert "[data-theme=\"dark\"] .ai-format-toolbar" in css
    assert ".ai-dock-panel.is-active .ai-composer-shell" in css
    assert "border-radius: 0" in css.split(".ai-composer-shell textarea")[1].split("}")[0]


def test_composer_send_uses_themeable_class():
    src = _read("components", "AIQuickCreate.js")
    toolbar = src[src.index("relative z-[1] flex items-center justify-between") : src.index("ai-inline-recorder")]
    assert "ai-composer-send" in toolbar
    assert "ai-composer-icon-btn" in toolbar
    assert "disabled:opacity-50" not in toolbar
    assert "bg-slate-200 text-slate-400" not in toolbar


def test_composer_shell_is_a_quiet_chat_card():
    css = _read("index.css")
    shell = css.split(".ai-composer-shell {")[1].split(".ai-composer-shell--inset")[0]
    assert "inset 0 0 0 1px" in shell
    assert "border-radius: 1rem" in shell
    assert "overflow: visible" in shell
    assert "ai-plus-menu" in css
