"""Slack follow-up after two ignored pings; replies update the task."""
import asyncio
import hashlib
import hmac
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from slack_followup import (
    PING_THRESHOLD,
    apply_assignee_actions,
    group_accountability,
    handle_assignee_slack_text,
    interpret_assignee_reply,
    is_slack_bot_event,
    opening_message,
    should_open_slack_followup,
    verify_slack_signature,
)


def test_should_open_after_two_pending_pings():
    assert PING_THRESHOLD == 2
    assert not should_open_slack_followup({"status": "Pending", "nudge_count": 1, "assigned_to": "a", "created_by": "b"})
    assert should_open_slack_followup({"status": "Pending", "nudge_count": 2, "assigned_to": "a", "created_by": "b"})
    assert not should_open_slack_followup({"status": "Accepted", "nudge_count": 3, "assigned_to": "a", "created_by": "b"})
    assert not should_open_slack_followup({"is_parent": True, "status": "Pending", "nudge_count": 5})
    assert not should_open_slack_followup({"status": "Pending", "nudge_count": 4, "slack_thread_id": "x", "assigned_to": "a", "created_by": "b"})
    assert not should_open_slack_followup({"status": "Pending", "nudge_count": 4, "assigned_to": "me", "created_by": "me"})


def test_interpret_on_it_done_cant_blocked_empty():
    task = {"title": "Q3 outreach"}
    on_it = interpret_assignee_reply("On it after standup.", task, "Maya Chen")
    assert any(a["type"] == "accept" for a in on_it["actions"])
    assert "accepted" in on_it["reply"].lower() or "on it" in on_it["reply"].lower()

    done = interpret_assignee_reply("Done — just sent it.", task, "Maya")
    assert any(a["type"] == "complete" for a in done["actions"])

    decline = interpret_assignee_reply("Can't this week, I'm on PTO.", task, "Maya")
    assert any(a["type"] == "decline" for a in decline["actions"])

    blocked = interpret_assignee_reply("Blocked — waiting on legal.", task, "Maya")
    assert any(a["type"] == "block" for a in blocked["actions"])

    empty = interpret_assignee_reply("   ", task, "Maya")
    assert empty["actions"] == []
    assert "on it" in empty["reply"].lower() or "blocked" in empty["reply"].lower()

    until = interpret_assignee_reply("Need until Friday", task, "Maya")
    types = [a["type"] for a in until["actions"]]
    assert "accept" in types and "comment" in types


def test_group_accountability_counts_silent_and_pinged():
    kids = [
        {"assigned_to_name": "Ada", "status": "Accepted", "viewed_at": "x"},
        {"assigned_to_name": "Ben", "status": "Pending", "viewed_at": "x", "nudge_count": 0},
        {"assigned_to_name": "Chris Park", "status": "Pending", "nudge_count": 2, "slack_thread_id": "t1"},
        {"assigned_to_name": "Priya Shah", "status": "Pending", "nudge_count": 2},
        {"assigned_to_name": "Dee", "status": "Completed", "viewed_at": "x"},
        {"is_parent": True, "status": "Pending"},
    ]
    roll = group_accountability(kids)
    assert roll["total"] == 5
    assert roll["delivered"] == 5
    assert roll["received"] == 3
    assert roll["accepted"] == 2
    assert roll["silent"] == 3
    assert roll["pinged_twice"] == 2
    assert roll["slack_threads"] == 1
    assert "Chris Park" in roll["pinged_names"]


def test_verify_slack_signature_and_opening_message():
    secret = "topsecret"
    ts = str(int(time.time()))
    body = b'{"type":"event_callback"}'
    basestring = f"v0:{ts}:{body.decode('utf-8')}"
    sig = "v0=" + hmac.new(secret.encode("utf-8"), basestring.encode("utf-8"), hashlib.sha256).hexdigest()
    assert verify_slack_signature(secret, ts, body, sig)
    assert not verify_slack_signature(secret, ts, body, "v0=nope")
    assert not verify_slack_signature("", ts, body, sig)
    msg = opening_message({"title": "send the Q3 outreach email", "due_date": "2026-08-16T17:00"}, "Chris Park", "Maya Chen")
    assert "Chris" in msg and "Maya" in msg
    assert "twice" in msg.lower()
    assert "blocked" in msg.lower()


def test_bot_events_are_ignored():
    assert is_slack_bot_event({"type": "message", "bot_id": "B1", "text": "hi", "user": "U1"})
    assert is_slack_bot_event({"type": "message", "subtype": "bot_message", "text": "hi", "user": "U1"})
    assert is_slack_bot_event({"type": "message", "text": "", "user": "U1"})
    assert not is_slack_bot_event({"type": "message", "user": "U1", "text": "on it"})


class _Coll:
    def __init__(self):
        self.store = {}

    async def update_one(self, query, update):
        doc = None
        for d in self.store.values():
            if all(d.get(k) == v for k, v in query.items()):
                doc = d
                break
        if not doc:
            return
        if "$set" in update:
            doc.update(update["$set"])
        if "$push" in update:
            for k, v in update["$push"].items():
                if isinstance(v, dict) and "$each" in v:
                    doc.setdefault(k, []).extend(v["$each"])
                else:
                    doc.setdefault(k, []).append(v)

    async def insert_one(self, doc):
        self.store[doc["id"]] = doc

    async def find_one(self, query, proj=None):
        for d in self.store.values():
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None


class _DB:
    def __init__(self):
        self.tasks = _Coll()
        self.slack_threads = _Coll()
        self.users = _Coll()


def test_handle_on_it_marks_accepted_and_replies():
    import os
    os.environ.pop("EMERGENT_LLM_KEY", None)
    os.environ.pop("OPENAI_API_KEY", None)
    db = _DB()
    task = {"id": "t1", "title": "Q3 outreach", "status": "Pending", "comments": []}
    thread = {"id": "th1", "task_id": "t1", "messages": [], "slack_channel_id": None}
    db.tasks.store["t1"] = dict(task)
    db.slack_threads.store["th1"] = dict(thread)
    assignee = {"id": "u1", "name": "Chris Park"}
    assigner = {"id": "u0", "name": "Maya Chen"}
    now = datetime(2026, 8, 16, 12, 0)

    result = asyncio.run(handle_assignee_slack_text(db, thread, task, assignee, assigner, "On it after standup.", now))
    assert result["applied"].get("status") == "Accepted"
    assert "accepted" in result["reply"].lower() or "on it" in result["reply"].lower()
    stored = db.tasks.store["t1"]
    assert stored["status"] == "Accepted"
    msgs = db.slack_threads.store["th1"]["messages"]
    assert any(m.get("role") == "user" for m in msgs)
    assert any(m.get("role") == "assistant" for m in msgs)


def test_apply_complete_sets_status():
    db = _DB()
    task = {"id": "t2", "title": "File", "status": "Accepted", "comments": []}
    db.tasks.store["t2"] = dict(task)
    now = datetime(2026, 8, 16, 12, 0)
    applied = asyncio.run(apply_assignee_actions(
        db, task, [{"type": "complete", "note": "shipped it"}], {"id": "u1", "name": "Chris"}, now
    ))
    assert applied["status"] == "Completed"
    assert db.tasks.store["t2"]["status"] == "Completed"


def test_server_and_ui_are_wired():
    root = Path(__file__).resolve().parents[1]
    server = (root / "backend" / "server.py").read_text(encoding="utf-8")
    follow = (root / "backend" / "slack_followup.py").read_text(encoding="utf-8")
    detail = (root / "frontend" / "src" / "pages" / "TaskDetail.js").read_text(encoding="utf-8")
    settings = (root / "frontend" / "src" / "pages" / "SettingsPage.js").read_text(encoding="utf-8")
    landing = (root / "frontend" / "src" / "pages" / "LandingPage.js").read_text(encoding="utf-8")
    assert '"/slack/events"' in server
    assert '"/tasks/{task_id}/slack-followup"' in server
    assert "slack_thread_id" in server
    assert "nudge_count" in (root / "backend" / "server.py").read_text(encoding="utf-8").split("class TaskResponse")[1].split("class TaskAction")[0]
    assert "_sweep_ignored_slack_followups" in server
    assert "process_assignee_slack_event" in follow
    assert "SlackFollowupCard" in detail
    assert "group-accountability" in detail
    assert "badge-pinged-twice" in detail
    assert "SLACK_BOT_TOKEN" in settings
    assert "landing-sim-slack" in landing
    assert "Pinged twice" in landing
    # Must not invent Slack threads when delivery fails / webhook-only
    assert "is_live_slack_thread" in follow
    assert "if not token:" in follow or "if not slack_bot_token()" in follow
    assert 'via != "slack_dm"' in server or "is_live_slack_thread" in server
