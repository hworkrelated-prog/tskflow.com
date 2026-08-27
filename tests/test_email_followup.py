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
    first_name,
    followup_copy,
    format_due_for_humans,
    followup_kind,
    has_assignee_update,
    ignored_guidance_copy,
    interpret_email_reply,
    looks_like_human_first_name,
    render_followup_email,
    reply_address,
    rfc_message_id,
    should_open_email_thread,
    should_send_email_followup,
    thread_headers,
    threaded_subject,
    token_from_addresses,
)

PST = pytz.timezone("America/Los_Angeles")
SLACK = (ROOT / "backend" / "slack_followup.py").read_text(encoding="utf-8")
SERVER = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


def test_slack_followup_file_is_untouched_by_email_module():
    assert "should_open_slack_followup" in SLACK
    assert "sweep_email_followups" not in SLACK
    assert "from email_followup import first_name" in SLACK
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
    assert "checking in on finish outreach training" in blob
    assert "henrik asked you to take this on" in blob
    assert "asked you to handle" not in blob
    assert "saturday, august 22 at 5:00 pm" in blob
    assert "circling back" not in blob
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
    assert "open_ignored_email_thread" in src
    assert "rfc_message_id" in src
    assert "should_open_email_thread" in SERVER
    assert "open_ignored_email_thread" in SERVER
    assert "headers=email_headers" in SERVER or "headers=headers" in SERVER


def test_email_thread_headers_continue_a_conversation():
    mid = rfc_message_id("tokAAA111")
    assert mid.startswith("<tskflow.tokAAA111@")
    first = thread_headers({}, mid)
    assert first["Message-ID"] == mid
    assert "In-Reply-To" not in first
    follow = thread_headers(
        {
            "email_thread_root_message_id": mid,
            "email_thread_last_message_id": mid,
        },
        rfc_message_id("tokBBB222"),
    )
    assert follow["In-Reply-To"] == mid
    assert mid in follow["References"]
    assert threaded_subject(None, "Have you had a chance") == "Have you had a chance"
    assert threaded_subject("Have you had a chance", "x") == "Re: Have you had a chance"
    assert threaded_subject("Re: Have you had a chance", "x") == "Re: Have you had a chance"


def test_ignored_guidance_opens_after_two_pings():
    task = {
        "status": "Pending",
        "nudge_count": 2,
        "assigned_to": "a",
        "created_by": "b",
        "title": "Finish outreach training",
    }
    assert should_open_email_thread(task) is True
    assert should_open_email_thread({**task, "nudge_count": 1}) is False
    assert should_open_email_thread({**task, "email_thread_id": "e1"}) is False
    assert should_open_email_thread({**task, "assigned_to": "a", "created_by": "a"}) is False
    copy = ignored_guidance_copy(task, "Ada Lovelace", "Henrik")
    blob = f"{copy['subject']} {copy['greeting']} {copy['body']}".lower()
    assert "ada" in blob
    assert "henrik asked you to take this on" in blob
    assert "asked you to handle" not in blob
    assert "twice" in blob
    assert "reply" in blob
    assert "tskflow" in blob
    assert "⚠️" not in blob


def test_first_name_filters_junk_placeholders():
    assert first_name("Ada Lovelace") == "Ada"
    assert first_name("Hashim") == "Hashim"
    assert first_name("Dr. Maya Chen") == "Maya"
    assert first_name("hashim@tskflow.com") == "Hashim"
    assert first_name("Email") == ""
    assert first_name("User") == ""
    assert first_name("Admin") == ""
    assert first_name("Test") == ""
    assert first_name("Preview") == ""
    assert first_name("Render") == ""
    assert first_name("Tskflow") == ""
    assert first_name("your manager") == ""
    assert first_name("") == ""
    assert first_name(None, "there") == "there"
    assert looks_like_human_first_name("Email") is False
    assert looks_like_human_first_name("Hashim") is True


def test_format_due_is_human_12_hour():
    assert format_due_for_humans("2026-08-29T17:00:00") == "Saturday, August 29 at 5:00 PM"
    assert format_due_for_humans("2026-08-29T17:00") == "Saturday, August 29 at 5:00 PM"
    assert format_due_for_humans("2026-08-29T09:05:00") == "Saturday, August 29 at 9:05 AM"
    assert format_due_for_humans("2026-08-29") == "Saturday, August 29"
    assert " at 17" not in format_due_for_humans("2026-08-29T17:00:00")
    assert format_due_for_humans("") == ""
    assert format_due_for_humans(None) == ""


def test_copy_never_greets_email_or_lets_render_ask():
    wording = followup_copy(
        "no_response",
        {"title": "Preview assigned to Hashim", "due_date": "2026-08-29T17:00:00"},
        "Email",
        "Render",
    )
    blob = f"{wording['subject']} {wording['greeting']} {wording['body']}"
    lower = blob.lower()
    assert "hey email" not in lower
    assert "hi email" not in lower
    assert "render asked" not in lower
    assert "asked you to handle" not in lower
    assert "handle preview assigned to hashim" not in lower
    assert "this is still open" in lower
    assert "saturday, august 29 at 5:00 pm" in lower
    assert "checking in on preview assigned to hashim" in lower
    assert "circling back" not in lower
    html = render_followup_email(
        "Email",
        "Render",
        {"id": "t1", "title": "Preview assigned to Hashim"},
        wording,
        "https://tskflow.com",
        reply_address("abc123token"),
    )
    assert "Hey Email" not in html
    assert "asked you to handle" not in html
    ignored = ignored_guidance_copy(
        {"title": "Preview assigned to Hashim", "due_date": "2026-08-29T17:00:00"},
        "Email",
        "Render",
    )
    ignored_blob = f"{ignored['subject']} {ignored['greeting']} {ignored['body']}".lower()
    assert "hey email" not in ignored_blob
    assert "render asked" not in ignored_blob
    assert "asked you to handle" not in ignored_blob
    assert "saturday, august 29 at 5:00 pm" in ignored_blob
