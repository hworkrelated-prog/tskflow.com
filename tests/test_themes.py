"""Light, dark, and minimal themes must stay readable."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return FRONT.joinpath(*parts).read_text(encoding="utf-8")


def test_theme_helper_persists_and_validates():
    src = _read("lib", "theme.js")
    assert "tsk_theme" in src
    assert "applyTheme" in src
    assert "colorScheme" in src
    assert "['light', 'dark', 'minimal']" in src or '"light", "dark", "minimal"' in src


def test_theme_applies_on_auth_and_settings():
    app = _read("App.js")
    settings = _read("pages", "SettingsPage.js")
    index = _read("..", "index.js") if False else (FRONT.parent / "src" / "index.js").read_text(encoding="utf-8")
    # index.js lives at frontend/src/index.js
    boot = _read("index.js")
    assert "applyTheme" in app
    assert "user?.preferences?.theme" in app
    assert "applyTheme" in settings
    assert "readCachedTheme" in boot


def test_dark_css_covers_translucent_white_cards():
    css = _read("App.css")
    assert r"bg-white\/70" in css
    assert r"bg-white\/95" in css
    assert "theme-toggle-knob" in css
    # Do not force every font-medium to light text (breaks outline buttons on light leftovers).
    assert "[data-theme=\"dark\"] .font-medium" not in css
    assert "[data-theme=\"dark\"] .font-semibold" not in css


def test_settings_eod_card_uses_semantic_surfaces():
    src = _read("pages", "SettingsPage.js")
    assert 'data-testid="eod-settings-card"' in src
    eod = src.split('data-testid="eod-settings-card"')[0][-180:]
    assert "bg-card" in eod
    assert "bg-white/70" not in src.split("End-of-day report")[1].split("Smart Reminders")[0]
    assert "theme-option-${t.id}" in src or 'theme-option-dark' in src


def test_voice_fab_sits_above_command_bar():
    src = _read("components", "VoiceMode.js")
    assert "7.5rem" in src
    assert "4.75rem" not in src
