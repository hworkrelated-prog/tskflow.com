"""EOD day picker, compact glance email, most-done + fastest leaderboards."""
from datetime import datetime
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from eod_report import (
    DEFAULT_WEEKEND_DAYS,
    aggregate_leaderboard,
    eod_sends_on_weekday,
    format_hours,
    group_unfinished,
    normalize_eod_days,
    render_eod_inner,
    render_eod_slack,
)

SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
SETTINGS = (ROOT / "frontend" / "src" / "pages" / "SettingsPage.js").read_text(encoding="utf-8")


def test_missing_days_keep_weekends_on():
    days = normalize_eod_days(None)
    assert 5 in days and 6 in days
    assert set(days) == set(range(7))


def test_empty_days_snap_to_saturday_sunday():
    assert normalize_eod_days([]) == DEFAULT_WEEKEND_DAYS
    assert normalize_eod_days(["x"]) == DEFAULT_WEEKEND_DAYS


def test_weekend_only_skips_monday():
    prefs = {"eod_days": [5, 6]}
    assert eod_sends_on_weekday(prefs, 6) is True   # Sunday
    assert eod_sends_on_weekday(prefs, 5) is True   # Saturday
    assert eod_sends_on_weekday(prefs, 0) is False  # Monday


def test_eod_is_due_respects_days():
    from server import _eod_is_due
    weekend = {"eod_enabled": True, "eod_hour": 16, "eod_days": [5, 6]}
    sunday = datetime(2026, 8, 16, 17, 0)  # Sunday
    monday = datetime(2026, 8, 17, 17, 0)  # Monday
    assert sunday.weekday() == 6
    assert monday.weekday() == 0
    assert _eod_is_due(weekend, sunday) is True
    assert _eod_is_due(weekend, monday) is False


def test_leaderboard_most_done_and_fastest():
    tasks = [
        {"assigned_to": "a", "assigned_to_email": "a@x.com", "completed_at": "2026-08-16T12:00:00", "accepted_at": "2026-08-16T10:00:00"},
        {"assigned_to": "a", "assigned_to_email": "a@x.com", "completed_at": "2026-08-16T15:00:00", "accepted_at": "2026-08-16T14:00:00"},
        {"assigned_to": "b", "assigned_to_email": "b@x.com", "completed_at": "2026-08-16T11:00:00", "accepted_at": "2026-08-16T10:50:00"},
    ]
    names = {"a": "Alice", "b": "Bob"}
    most, fastest = aggregate_leaderboard(tasks, names, limit=3)
    assert most[0]["name"] == "Alice" and most[0]["completed"] == 2
    assert fastest[0]["name"] == "Bob"
    assert format_hours(0.2).endswith("m")


def test_didnt_finish_groups_people():
    now = datetime(2026, 8, 16, 18, 0)
    open_tasks = [
        {"assigned_to": "b", "title": "Outreach email", "status": "Accepted", "due_date": "2026-08-15T17:00:00"},
        {"assigned_to": "c", "title": "Q3 recap", "status": "Pending", "due_date": "2026-08-20T17:00:00"},
    ]
    stuck = group_unfinished(open_tasks, {"b": "Bob", "c": "Cara"}, now)
    assert stuck[0]["who"] == "Bob" and stuck[0]["why"] == "overdue"
    assert any(s["why"] == "hasn't accepted" for s in stuck)


def test_email_is_short_glance():
    html = render_eod_inner({
        "first": "Hashim",
        "day": "Sunday, Aug 16, 2026",
        "done_count": 2,
        "open_count": 1,
        "overdue_count": 1,
        "done_items": [{"title": "Send Q3 recap", "who": "Alice"}],
        "stuck_items": [{"who": "Bob", "why": "overdue", "titles": ["Outreach email"]}],
        "most_done": [{"name": "Alice", "completed": 2}],
        "fastest": [{"name": "Bob", "avg_hours": 0.3}],
        "board_label": "Today",
    })
    assert "Your day, Hashim" in html
    assert "2 done · 1 open · 1 overdue" in html
    assert "Done" in html
    assert "Didn't finish" in html or "Didn&#39;t finish" in html or "Didn\\'t finish" in html
    assert "Most done" in html
    assert "Fastest" in html
    assert "Leaderboard" in html
    assert "Suggested plan" not in html
    assert "Still open (0)" not in html
    slack = render_eod_slack({
        "first": "Hashim", "day": "Sunday", "done_count": 2, "open_count": 1,
        "overdue_count": 1, "stuck_items": [{"who": "Bob", "why": "overdue"}],
        "most_done": [{"name": "Alice", "completed": 2}],
        "fastest": [{"name": "Bob", "avg_hours": 0.3}],
    })
    assert "Most done" in slack
    assert "Fastest" in slack


def test_settings_has_day_chips_including_weekend():
    assert 'data-testid="eod-days"' in SETTINGS
    assert 'data-testid={`eod-day-${d.n}`}' in SETTINGS
    assert "Sun" in SETTINGS and "Sat" in SETTINGS
    assert "toggleEodDay" in SETTINGS
    assert "eod_days" in SETTINGS
    assert "[5, 6]" in SETTINGS  # weekend fallback
    assert "eod_days" in SERVER
    assert "normalize_eod_days" in SERVER
    assert "render_eod_inner" in SERVER
    assert "Most done" in (ROOT / "backend" / "eod_report.py").read_text(encoding="utf-8")
