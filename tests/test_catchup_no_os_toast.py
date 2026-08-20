"""Catch-up on open must not fire an OS toast."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "frontend" / "src" / "App.js").read_text(encoding="utf-8")


def test_catch_up_does_not_fire_os_notification_on_open():
    # The spammy banner: "Catch up on your work" / "You have updates waiting"
    assert "Catch up on your work" not in APP
    assert "You have updates waiting in TskFlow" not in APP
    assert "tag: 'tsk-catch-up'" not in APP
    assert "tskflow:catch-up" in APP  # in-app sheet still opens


def test_catch_up_skips_other_only_noise():
    assert "catchUpIsMeaningful" in APP
    assert "unread_reminders" in APP
    assert "Do NOT poll immediately on tab-focus" in APP
