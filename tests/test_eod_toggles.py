"""EOD reports actually send, iOS-green toggles, readable reminder presets."""
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
SETTINGS = (ROOT / "frontend" / "src" / "pages" / "SettingsPage.js").read_text(encoding="utf-8")
CSS = (ROOT / "frontend" / "src" / "App.css").read_text(encoding="utf-8")


def test_eod_due_after_chosen_hour_once_per_day():
    import sys
    sys.path.insert(0, str(ROOT / "backend"))
    from server import _eod_is_due, _eod_target_hour

    prefs = {"eod_enabled": True, "eod_hour": 16}
    assert _eod_target_hour(prefs) == 16
    assert _eod_is_due(prefs, datetime(2026, 8, 17, 15, 59)) is False
    assert _eod_is_due(prefs, datetime(2026, 8, 17, 16, 0)) is True
    assert _eod_is_due(prefs, datetime(2026, 8, 17, 20, 5)) is True
    sent = {**prefs, "eod_last_sent_date": "2026-08-17"}
    assert _eod_is_due(sent, datetime(2026, 8, 17, 20, 5)) is False
    assert _eod_is_due({"eod_enabled": False, "eod_hour": 16}, datetime(2026, 8, 17, 20, 0)) is False


def test_eod_wired_into_in_app_scheduler():
    loop = SERVER.split("async def _scheduler_loop")[1].split("async def _ensure_indexes")[0]
    assert "await send_due_eod_reports()" in loop
    assert "eod_last_sent_date" in SERVER
    assert "now.hour >= _eod_target_hour(prefs)" in SERVER


def test_ios_switch_is_green_when_on():
    assert "function IosSwitch" in SETTINGS
    assert 'testId="eod-enabled-toggle"' in SETTINGS
    assert 'testId="reminders-enable-toggle"' in SETTINGS
    assert "data-testid={testId}" in SETTINGS
    assert "peer-checked:bg-amber-500" not in SETTINGS
    assert "peer-checked:bg-rose-500" not in SETTINGS
    assert ".ios-switch.is-on" in CSS
    on = CSS.split(".ios-switch.is-on")[1].split("}")[0]
    assert "#34c759" in on
    dark_on = CSS.split("[data-theme=\"dark\"] .ios-switch.is-on")[1].split("}")[0]
    assert "#34c759" in dark_on


def test_reminder_presets_are_a_compact_bar():
    card = SETTINGS.split("reminders-settings-card")[1].split("export default")[0]
    assert "grid grid-cols-3" not in card
    assert "flex rounded-xl border" in card
    assert "Nudges when work is stuck or due" not in SETTINGS
    assert "Connect Slack first" not in SETTINGS
    block = SETTINGS.split("reminder-preset-${key}")[1].split("aria-pressed")[0]
    assert "bg-rose-50" not in block
    assert "text-slate-800" not in SETTINGS.split("Reminder intensity")[1].split("Customize")[0]
    assert "bg-rose-600" in SETTINGS
    assert "bg-rose-600 text-white" in SETTINGS
    assert "[data-theme=\"dark\"] .bg-rose-50" in CSS or r'[data-theme="dark"] .bg-rose-50' in CSS
