"""Email follow-up is a parallel channel to Slack — timing, tone, inbound mapping."""
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from email_followup import (
    approaching_hours,
    email_channel_allowed,
    followup_copy,
    followup_kind,
    has_assignee_update,
    interpret_email_reply,
    render_followup_email,
    reply_address,
    should_send_email_followup,
    token_from_addresses,
)

PST = pytz.timezone("America/Los_Angeles")
SLACK = (ROOT / "backend" / "slack_followup.py").read_text(encoding="utf-8")
SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


def test_slack_followup_file_is_untouched_by_email_module():
    assert "should_open_slack_followup" in SLACK
    assert "from email_followup" not in SLACK
    assert "sweep_email_followups" in SERVER
    assert "from email_followup import" in SERVER
    assert 'RESEND_WEBHOOK_SECRET' in SERVER
    assert "/webhooks/resend/inbound" in SERVER


def test_approaching_uses_priority_fraction():
    assert approaching_hours(1) == 0.75
    assert approaching_hours(8) == 6.0
    assert approaching_hours(24) == 18.0


def test_no_response_fires_when_approaching_and_no_update():
    now = datetime(2026, 8, 22, 14, 0, tzinfo=PST)
    task = {
        "id": "t1",
        "title": "Finish outreach training",
        "priority": "High",
        "status": "Pending",
        "created_at": (now - timedelta(hours=1, minutes=40)).isoformat(),
        "deleted": False,
    }
    assert has_assignee_update(task) is False
    assert followup_kind(task, now) == "no_response"
    # Too early
    fresh = dict(task)
    fresh["created_at"] = (now - timedelta(minutes=20)).isoformat()
    assert followup_kind(fresh, now) is None


def test_email_pref_gate():
    user = {"preferences": {}}
    assert email_channel_allowed(user, None) is True
    assert email_channel_allowed(user, {"enabled": True, "channels": ["in_app"]}) is False
    assert email_channel_allowed(user, {"enabled": True, "channels": ["in_app", "email"]}) is True
    assert email_channel_allowed(user, {"enabled": False, "channels": ["email"]}) is False
    assert email_channel_allowed({"preferences": {"email_followups": False}}, None) is False


def test_should_send_respects_gap_and_update():
    now = datetime(2026, 8, 22, 14, 0, tzinfo=PST)
    task = {
        "id": "t1",
        "title": "Call Maya",
        "priority": "Urgent",
        "status": "Pending",
        "created_at": (now - timedelta(hours=1)).isoformat(),
    }
    user = {"email": "a@x.com", "name": "Ada"}
    assert should_send_email_followup(task, user, None, now) == "no_response"
    accepted = dict(task, status="Accepted", accepted_at=now.isoformat())
    assert should_send_email_followup(accepted, user, None, now) is None


def test_copy_is_human_not_a_system_banner():
    wording = followup_copy(
        "no_response",
        {"title": "Finish outreach training", "due_date": "2026-08-22T17:00"},
        "Ada Lovelace",
        "Henrik",
    )
    blob = f"{wording['subject']} {wording['greeting']} {wording['body']}".lower()
    assert "hey ada" in blob
    assert "tskflow reminder" not in blob
    assert "⚠️" not in blob
    html = render_followup_email(
        "Ada Lovelace", "Henrik",
        {"id": "t1", "title": "Finish outreach training"},
        wording, "https://tskflow.com",
        reply_address("abc123token"),
    )
    assert "Open the task" in html
    assert "Just reply to this email" in html
    assert "TSKFLOW REMINDER" not in html


def test_reply_token_roundtrip():
    addr = reply_address("tokAAA111")
    assert addr.startswith("updates+")
    assert token_from_addresses([addr]) == "tokAAA111"
    assert token_from_addresses(["Ada <Ada@x.com>"]) is None


def test_interpret_email_does_not_guess():
    done = interpret_email_reply("Done — sent the deck.")
    assert done["intent"] == "done"
    assert done["confidence"] >= 0.75
    blocked = interpret_email_reply("Blocked waiting on legal")
    assert blocked["intent"] == "blocked"
    progress = interpret_email_reply("Still working on it, in progress")
    assert progress["intent"] == "in_progress"
    vague = interpret_email_reply("ok")
    assert vague["intent"] == "unclear"
    assert vague["confidence"] < 0.75
    assert vague["actions"] == []


def test_apply_and_review_paths_exist():
    src = (ROOT / "backend" / "email_followup.py").read_text(encoding="utf-8")
    assert "CONFIDENCE_AUTO = 0.75" in src
    assert "flag_email_reply_for_review" in src
    assert "Updated from an email reply" in src
    assert "do NOT guess" in src
    assert "priority_followup_config" in src
