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
    assert "pinDocumentTheme" in src
    assert "restoreDocumentTheme" in src
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
    assert "ios-switch" in src
    assert "#34c759" in _read("App.css")


def test_sales_badge_is_readable_in_dark_mode():
    css = _read("App.css")
    card = _read("components", "TaskCard.js")
    group = _read("components", "ParentTaskGroup.js")
    detail = _read("pages", "TaskDetail.js")
    assert ".sales-badge" in css
    dark = css.split("[data-theme=\"dark\"] .sales-badge")[1].split("}")[0]
    assert "#f0fdfa" in dark
    assert "#0f766e" in dark
    assert "[data-theme=\"dark\"] .text-amber-950" in css
    index = _read("index.css")
    assert ".ai-people-dropdown" in index
    assert "[data-theme=\"dark\"] .ai-people-dropdown" in index
    assert "[data-theme=\"dark\"] .text-teal-950" in css
    assert "text-emerald-800" in css
    assert 'className="sales-badge"' in card
    assert "sales-badge" in group
    assert "sales-badge" in detail
    assert "bg-emerald-50 text-emerald-800" not in card
    assert "bg-emerald-50 text-emerald-800" not in group.split("sales-badge")[1][:400]


def test_dark_composer_field_stays_flush_with_shell():
    css = _read("index.css")
    app = _read("App.css")
    src = _read("components", "AIQuickCreate.js")
    dark_field = css.split("[data-theme=\"dark\"] .ai-composer-shell textarea")[1].split("::placeholder")[0]
    assert "background: transparent !important" in dark_field
    assert "border-color: transparent !important" in dark_field
    assert "background: transparent !important" in app.split(".ai-composer-shell textarea")[1].split("}")[0]
    assert "ai-composer-send" in src
    assert "is-ready" in src
    send = css.split("[data-theme=\"dark\"] .ai-composer-send.is-ready")[1].split("}")[0]
    assert "#f4f4f5" in send
    assert "#111111" in send
    idle = css.split("[data-theme=\"dark\"] .ai-composer-send {")[1].split("}")[0]
    assert "rgba(255, 255, 255, 0.18)" in idle
    placeholder = css.split("[data-theme=\"dark\"] .ai-prompt-placeholder")[1].split("}")[0]
    assert "rgb(148 163 184)" not in placeholder
    assert "hsl(215 14% 72%)" in placeholder


def test_voice_fab_sits_above_command_bar():
    src = _read("components", "VoiceMode.js")
    css = _read("index.css")
    # Shared bottom stage replaces the guessed 7.5rem FAB offset.
    assert "ai-jarvis-anchor" in src
    assert "dockIntegrated" in src
    assert "4.75rem" not in src
    assert "7.5rem" not in src
    assert ".ai-bottom-stage" in css
    assert "flex-direction: column" in css
