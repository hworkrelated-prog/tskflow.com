"""In-app reminders push in the background; clocks stay on Pacific send time."""
import sys
from datetime import datetime
from pathlib import Path

import pytz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from activity_helpers import app_now_iso, serialize_app_ts
SERVER = (ROOT / "backend/server.py").read_text(encoding="utf-8")
APP = (ROOT / "frontend/src/App.js").read_text(encoding="utf-8")
PUSH = (ROOT / "frontend/src/lib/push.js").read_text(encoding="utf-8")
DETAIL = (ROOT / "frontend/src/pages/TaskDetail.js").read_text(encoding="utf-8")
DT = (ROOT / "frontend/src/lib/datetime.js").read_text(encoding="utf-8")
PST = pytz.timezone("America/Los_Angeles")


def test_web_push_fires_for_reminders_and_generic_notifications():
    assert "await send_web_push(" in SERVER
    assert 'f"/task/{t[\'id\']}?tab=reminders"' in SERVER
    assert "await send_web_push(user_id, doc[\"title\"], doc[\"body\"], push_url)" in SERVER


def test_session_registers_push_and_logout_unregisters():
    assert "registerPush" in APP
    assert "unregisterPush" in APP
    assert "export const unregisterPush" in PUSH
    assert "push/unsubscribe" in PUSH


def test_reminder_cards_use_pacific_clock():
    assert "formatAppDateTime" in DETAIL
    assert "America/Los_Angeles" in DT
    assert "format(new Date(a.created_at)" not in DETAIL
    assert "a.sent_at || a.created_at" in DETAIL


def test_notifications_use_same_pacific_clock():
    bell = (ROOT / "frontend/src/components/NotificationBell.js").read_text(encoding="utf-8")
    catch = (ROOT / "frontend/src/components/CatchUpReview.js").read_text(encoding="utf-8")
    assert "formatAppDateTime" in bell
    assert "n.sent_at || n.created_at" in bell
    assert "formatDistanceToNow" not in bell
    assert "n.sent_at || n.created_at" in catch
    assert '"sent_at": sent_at' in SERVER
    assert "create_notification(" in SERVER
    assert "created_at: Optional[str] = None" in SERVER


def test_serialize_app_ts_keeps_pacific_evening():
    evening = PST.localize(datetime(2026, 8, 22, 20, 3, 0))
    assert serialize_app_ts(evening) == "2026-08-22T20:03:00-07:00"
    assert serialize_app_ts("2026-08-23T03:03:00.123456Z") == "2026-08-22T20:03:00-07:00"
    assert serialize_app_ts("2026-08-22T20:03:00.123456") == "2026-08-22T20:03:00-07:00"


def test_frontend_formats_utc_instant_as_pacific_wall_clock():
    import subprocess
    script = (
        "import { formatAppDateTime } from './frontend/src/lib/datetime.js';"
        "const out = formatAppDateTime('2026-08-23T03:03:00.123456Z');"
        "if (!out.includes('8:03') || !out.includes('PM')) throw new Error(out);"
        "process.stdout.write(out);"
    )
    out = subprocess.check_output(
        ["node", "--input-type=module", "-e", script],
        cwd=str(ROOT),
        text=True,
    )
    assert "8:03" in out and "PM" in out


def test_activity_default_clock_is_pacific_not_naive_utc():
    helpers = (ROOT / "backend/activity_helpers.py").read_text(encoding="utf-8")
    assert "datetime.utcnow().isoformat() + \"Z\"" not in helpers
    assert "serialize_app_ts(created_at) or app_now_iso()" in helpers
    stamp = app_now_iso()
    assert stamp.endswith("-07:00") or stamp.endswith("-08:00")
