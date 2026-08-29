"""Weekly Friday 3pm engagement digest for the product owner."""
from datetime import datetime
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from engagement import (
    FRIDAY,
    SEND_HOUR_PST,
    digest_subject,
    engagement_blurb,
    render_engagement_html,
    should_send_weekly,
    week_id,
)


def test_sends_only_friday_3pm_pacific():
    friday_3 = datetime(2026, 8, 21, 15, 4)  # Friday
    friday_2 = datetime(2026, 8, 21, 14, 59)
    thursday_3 = datetime(2026, 8, 20, 15, 0)
    assert friday_3.weekday() == FRIDAY
    assert SEND_HOUR_PST == 15
    assert should_send_weekly(friday_3) is True
    assert should_send_weekly(friday_2) is False
    assert should_send_weekly(thursday_3) is False


def test_week_id_is_iso_week():
    assert week_id(datetime(2026, 8, 21, 15, 0)) == "2026-W34"


def test_blurb_and_short_html():
    quiet = {
        "total_users": 12,
        "active_week": 0,
        "tasks_assigned_out_week": 0,
        "new_users_week": 0,
        "active_today": 0,
        "tasks_assigned_out": 3,
        "open_assigned_out": 2,
        "completed_week": 0,
        "open_self": 1,
        "overdue": 0,
        "never_created_a_task": 4,
        "top_domains": [{"domain": "acmecorp.com", "users": 8}],
    }
    assert "Quiet week" in engagement_blurb(quiet)
    busy = {**quiet, "active_week": 5, "tasks_assigned_out_week": 9}
    assert "5 of 12 people were active" in engagement_blurb(busy)
    assert "9 tasks went out" in engagement_blurb(busy)
    html = render_engagement_html(busy, datetime(2026, 8, 21, 15, 0))
    assert "Signed up (total)" in html
    assert "Assigned out this week" in html
    assert "acmecorp.com" in html
    assert "9" in html
    assert digest_subject(datetime(2026, 8, 21, 15, 0)).startswith("Tskflow weekly")


def test_wired_into_admin_and_scheduler():
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    admin = (ROOT / "frontend" / "src" / "pages" / "AdminPage.js").read_text(encoding="utf-8")
    assert "send_weekly_engagement_digest" in server
    assert 'POST("/cron/engagement-digest")' in server or '@api_router.post("/cron/engagement-digest")' in server
    assert '@api_router.get("/admin/engagement")' in server
    assert '@api_router.post("/admin/engagement/send")' in server
    assert "await send_weekly_engagement_digest()" in server
    assert "last_login" in server
    assert "last_active" in server
    assert 'data-testid="admin-engagement"' in admin
    assert 'data-testid="admin-engagement-send"' in admin
    assert "Email me this week" in admin
    assert "Friday at 3:00 PM Pacific" in admin


def test_weekly_digest_still_runs_alongside_the_daily_analytics_email():
    """Adding the daily funnel email must not displace the Friday digest."""
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    admin = (ROOT / "frontend" / "src" / "pages" / "AdminPage.js").read_text(encoding="utf-8")
    loop_body = server.split("async def _scheduler_loop()")[1].split("async def _ensure_indexes")[0]
    assert "await send_weekly_engagement_digest()" in loop_body
    assert "await send_daily_analytics()" in loop_body
    assert "engagement_digests" in server
    assert "daily_analytics_digests" in server or "DIGEST_COLLECTION" in server
    assert "Email me this week" in admin
    assert "Email me today" in admin
