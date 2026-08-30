"""Pay only after send/receive usage over time."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from billing_nudge import billing_nudge_ready, account_age_days, activity_span_days


def test_nudge_requires_send_receive_and_time():
    assert billing_nudge_ready(account_days=20, sent=8, received=4, span_days=10) is True
    assert billing_nudge_ready(account_days=3, sent=8, received=4, span_days=10) is False
    assert billing_nudge_ready(account_days=20, sent=1, received=4, span_days=10) is False
    assert billing_nudge_ready(account_days=20, sent=8, received=0, span_days=10) is False
    assert billing_nudge_ready(account_days=20, sent=8, received=4, span_days=1) is False


def test_account_age_and_span_helpers():
    now = datetime(2026, 8, 28, tzinfo=timezone.utc)
    created = (now - timedelta(days=21)).isoformat()
    assert account_age_days(created, now) >= 20
    assert account_age_days(None, now) == 0
    first = (now - timedelta(days=10)).isoformat()
    last = now.isoformat()
    assert activity_span_days(first, last) >= 9


def test_product_does_not_nudge_on_task_count():
    hub = (ROOT / "frontend" / "src" / "pages" / "TaskHub.js").read_text(encoding="utf-8")
    settings = (ROOT / "frontend" / "src" / "pages" / "SettingsPage.js").read_text(encoding="utf-8")
    landing = (ROOT / "frontend" / "src" / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    register = (ROOT / "frontend" / "src" / "pages" / "RegistrationPage.js").read_text(encoding="utf-8")
    server = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
    assert "activeTaskCount >= 10" not in hub
    assert "activeTaskCount >= 20" not in hub
    assert "show_billing_nudge" in hub
    assert "billing-nudge-banner" in hub
    assert "user?.show_billing_nudge" in settings
    assert "Try Teams Free for 30 Days" not in settings
    assert "No credit card" in register
    assert "No card" not in landing
    assert "exchanging work" not in landing
    assert "Simple pricing" not in landing
    assert "from billing_nudge import show_billing_nudge" in server
