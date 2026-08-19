"""Reminder spacing + Slack follow-up gating (no fake Slack when disconnected)."""
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock

import pytz

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from slack_followup import open_ignored_task_thread, should_open_slack_followup


PST = pytz.timezone("America/Los_Angeles")
ROOT = Path(__file__).resolve().parents[1]
BE = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")
FE = (ROOT / "frontend" / "src" / "pages" / "TaskDetail.js").read_text(encoding="utf-8")


class _Coll:
    def __init__(self):
        self.store = {}
        self.inserted = []

    async def update_one(self, query, update):
        doc = None
        for d in self.store.values():
            if all(d.get(k) == v for k, v in query.items()):
                doc = d
                break
        if not doc:
            # allow task updates by id even if not preloaded in store values map
            tid = query.get("id")
            if tid and tid in self.store:
                doc = self.store[tid]
            else:
                return
        if "$set" in update:
            doc.update(update["$set"])

    async def insert_one(self, doc):
        self.inserted.append(doc)
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


def test_gap_helper_fail_closed_and_min_floor():
    # Pull helpers out of server.py without importing the whole FastAPI app
    start = BE.index("MIN_NUDGE_GAP_HOURS")
    end = BE.index("class ReminderRule")
    ns = {"Optional": __import__("typing").Optional, "datetime": datetime, "timedelta": timedelta, "PST": PST}
    exec(BE[start:end], ns)
    assert ns["MIN_NUDGE_GAP_HOURS"] == 2
    now = datetime(2026, 8, 15, 11, 11, tzinfo=PST)
    # recent send blocks
    assert ns["_gap_blocks"]((now - timedelta(minutes=30)).isoformat(), now, 4) is True
    # old enough allows
    assert ns["_gap_blocks"]((now - timedelta(hours=5)).isoformat(), now, 4) is False
    # corrupt stamp blocks (fail closed — no 5-min spam)
    assert ns["_gap_blocks"]("not-a-date", now, 4) is True
    assert ns["_gap_blocks"](None, now, 4) is False


def test_reminder_rule_clamps_frequency_to_min_two():
    start = BE.index("class ReminderRule")
    end = BE.index("\n\n@api_router.get(\"/reminders/rules\")")
    from pydantic import BaseModel, validator
    from typing import List, Optional
    ns = {
        "BaseModel": BaseModel,
        "validator": validator,
        "List": List,
        "Optional": Optional,
        "MIN_NUDGE_GAP_HOURS": 2,
    }
    exec(BE[start:end], ns)
    Rule = ns["ReminderRule"]
    assert Rule(frequency_hours=1).frequency_hours == 2
    assert Rule(frequency_hours=0).frequency_hours == 2
    assert Rule(frequency_hours=12).frequency_hours == 12


def test_open_ignored_task_thread_requires_real_slack_delivery():
    db = _DB()
    task = {
        "id": "t1",
        "title": "Clear opportunities",
        "status": "Pending",
        "nudge_count": 2,
        "assigned_to": "u1",
        "created_by": "u0",
    }
    db.tasks.store["t1"] = dict(task)
    assignee = {"id": "u1", "name": "Benjamin White", "email": "ben@ex.com"}
    assigner = {"id": "u0", "name": "Maya"}
    now = datetime(2026, 8, 15, 11, 11, tzinfo=PST)

    # No bot token, webhook reports failure → no thread, no fake Slack
    async def fail_webhook(_text):
        return False

    out = asyncio.run(open_ignored_task_thread(db, task, assignee, assigner, now, post_webhook=fail_webhook))
    assert out is None
    assert db.slack_threads.inserted == []

    # Webhook succeeds → real thread
    async def ok_webhook(_text):
        return True

    out2 = asyncio.run(open_ignored_task_thread(db, task, assignee, assigner, now, post_webhook=ok_webhook))
    assert out2 is not None
    assert out2["via"] == "webhook"
    assert len(db.slack_threads.inserted) == 1


def test_server_gates_slack_followup_and_collapses_activity():
    assert "if not slack_bot_token() and not webhook_preview" in BE
    assert 'via not in ("slack_dm", "webhook")' in BE or "via not in ('slack_dm', 'webhook')" in BE
    assert '"channels": channels_sent' in BE
    assert "MIN_NUDGE_GAP_HOURS" in BE
    assert "_gap_blocks" in BE
    # activity API hides fake slack follow-ups
    assert '"slack follow-up" in title' in BE


def test_task_detail_prefetches_and_colors_by_kind():
    assert "fetchReminderActivity()" in FE
    assert "reminderActivityTone" in FE
    assert "searchParams.get('tab') === 'reminders'" in FE
    assert "bg-rose-50/80 border-rose-200" in FE
    assert "CHANNEL_BADGE" in FE


def test_should_open_still_requires_two_pings():
    assert should_open_slack_followup({"status": "Pending", "nudge_count": 2, "assigned_to": "a", "created_by": "b"})
    assert not should_open_slack_followup({"status": "Pending", "nudge_count": 1, "assigned_to": "a", "created_by": "b"})
