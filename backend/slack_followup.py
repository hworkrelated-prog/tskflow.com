"""Slack follow-up when someone ignores a task after repeated pings.

After two unanswered pings, Hound opens a Slack DM (Rook talking like a teammate).
Replies and tap buttons update the task.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("tskflow.slack")

PING_THRESHOLD = 2
SLACK_API = "https://slack.com/api"

_ACCEPT_RE = re.compile(
    r"(?i)\b(on it|i'?ll (do|take|handle|get|finish)|will do|accepted?|yes|yep|yeah|"
    r"got it|consider it done|after standup|i can take|i'?m on it)\b"
)
_DONE_RE = re.compile(r"(?i)\b(done|finished|completed|just (sent|shipped|filed)|all set)\b")
_DECLINE_RE = re.compile(
    r"(?i)\b(can'?t|cannot|won'?t|decline|not going to|out of office|\boo+\b|pto|on leave)\b"
)
_BLOCK_RE = re.compile(r"(?i)\b(blocked|stuck|waiting on|need help|need .+ from)\b")
_RESCHEDULE_RE = re.compile(
    r"(?i)\b(?:until|by|need(?:\s+until)?)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|eod|next week)\b"
)


def slack_bot_token() -> str:
    return (os.getenv("SLACK_BOT_TOKEN") or "").strip()


def slack_signing_secret() -> str:
    return (os.getenv("SLACK_SIGNING_SECRET") or "").strip()


def should_open_slack_followup(task: dict) -> bool:
    """True when the assignee has ignored the ask after enough pings."""
    if not task or task.get("is_parent"):
        return False
    if task.get("slack_thread_id"):
        return False
    if (task.get("status") or "Pending") != "Pending":
        return False
    if task.get("assigned_to") and task.get("assigned_to") == task.get("created_by"):
        return False
    try:
        pings = int(task.get("nudge_count") or 0)
    except (TypeError, ValueError):
        pings = 0
    return pings >= PING_THRESHOLD


def is_slack_bot_event(event: Optional[dict]) -> bool:
    """Ignore bot posts, edits, and anything that is not a user message."""
    if not event or not isinstance(event, dict):
        return True
    if event.get("bot_id") or event.get("bot_profile"):
        return True
    subtype = event.get("subtype") or ""
    if subtype in ("bot_message", "message_changed", "message_deleted", "message_replied"):
        return True
    if event.get("type") not in (None, "message"):
        return True
    if not event.get("user") or not (event.get("text") or "").strip():
        return True
    return False


def verify_slack_signature(signing_secret: str, timestamp: str, body: bytes, signature: str) -> bool:
    if not signing_secret or not timestamp or not signature:
        return False
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(time.time() - ts) > 60 * 5:
        return False
    basestring = f"v0:{timestamp}:{body.decode('utf-8')}"
    digest = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        basestring.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, signature)


def interpret_assignee_reply(text: str, task: Optional[dict] = None, assigner_name: str = "your manager") -> dict:
    """Turn a Slack reply into task actions + a human reply. Deterministic (no LLM)."""
    raw = (text or "").strip()
    if not raw:
        return {
            "actions": [],
            "reply": "I didn't catch that — can you say whether you can take it, you're blocked, or you're done?",
        }
    title = (task or {}).get("title") or "this"
    mgr = (assigner_name or "your manager").split()[0] or "your manager"
    actions: List[dict] = []
    reply = ""

    if _DONE_RE.search(raw):
        actions.append({"type": "complete", "note": raw})
        reply = f"Nice — I marked {title} complete and let {mgr} know. Thanks for closing it."
    elif _DECLINE_RE.search(raw) and not _ACCEPT_RE.search(raw):
        actions.append({"type": "decline", "reason": raw})
        reply = f"Understood. I declined it on your behalf and told {mgr} why, so they aren't waiting in silence."
    elif _BLOCK_RE.search(raw):
        actions.append({"type": "block", "reason": raw})
        reply = f"Got it — I flagged you as blocked on {title} so {mgr} can see what's in the way. Tell me if that changes."
    elif _RESCHEDULE_RE.search(raw):
        when = _RESCHEDULE_RE.search(raw).group(1)
        actions.append({"type": "comment", "note": raw})
        actions.append({"type": "accept"})
        reply = (
            f"I'll take that as a yes, with a bit more time — {when}. "
            f"I marked you accepted and left {mgr} a note. Ping me if the date needs to move again."
        )
    elif _ACCEPT_RE.search(raw):
        actions.append({"type": "accept"})
        actions.append({"type": "comment", "note": raw})
        reply = f"Perfect — you're on it. I marked you accepted on {title}. I'll stay out of your way unless this slips."
    else:
        actions.append({"type": "comment", "note": raw})
        reply = (
            f"Heard. I left that on the task for {mgr}. "
            "If you can take it, just say “on it”; if you're stuck, tell me what's blocking you."
        )

    return {"actions": actions, "reply": reply, "user_text": raw}


async def maybe_llm_interpret(text: str, task: Optional[dict], assigner_name: str, parsed: dict) -> dict:
    """If regex only left a comment, let the LLM talk like a teammate and pick an intent."""
    actions = parsed.get("actions") or []
    classified = any((a or {}).get("type") in ("accept", "complete", "decline", "block") for a in actions)
    if classified:
        return parsed
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        return parsed
    try:
        from llm import chat_complete

        title = (task or {}).get("title") or "this task"
        prompt = (
            "You are Rook, a teammate following up in a Slack DM. Speak like a person, not a bot menu.\n"
            f"Task: {title}\nAssigner: {assigner_name}\nTheir message: {text}\n"
            "Return JSON only, no markdown: "
            '{"intent":"accept|complete|decline|block|comment","reply":"1-3 casual sentences"}\n'
            "accept = they will do it. complete = they already did. decline = they cannot. "
            "block = stuck. comment = note it and ask a short clarifying question."
        )
        raw = await chat_complete(
            model="gpt-4o-mini",
            system="You are Rook, a concise human teammate on Slack. Never mention being an AI.",
            user=prompt,
            json_mode=True,
            api_key=key,
        )
        blob = (raw if isinstance(raw, str) else str(raw)).strip()
        if blob.startswith("```"):
            blob = re.sub(r"^```(?:json)?\s*|\s*```$", "", blob).strip()
        data = json.loads(blob)
        intent = (data.get("intent") or "comment").strip().lower()
        reply = (data.get("reply") or "").strip()[:800]
        if not reply:
            return parsed
        next_actions: List[dict] = []
        if intent == "complete":
            next_actions.append({"type": "complete", "note": text})
        elif intent == "decline":
            next_actions.append({"type": "decline", "reason": text})
        elif intent == "block":
            next_actions.append({"type": "block", "reason": text})
        elif intent == "accept":
            next_actions.append({"type": "accept"})
            next_actions.append({"type": "comment", "note": text})
        else:
            next_actions.append({"type": "comment", "note": text})
        return {"actions": next_actions, "reply": reply, "user_text": text}
    except Exception as e:
        logger.warning("LLM Slack interpret skipped: %s", e)
        return parsed


def opening_message(task: dict, assignee_name: str, assigner_name: str) -> str:
    from email_followup import first_name, format_due_for_humans

    first = first_name(assignee_name)
    mgr = first_name(assigner_name)
    due = format_due_for_humans(task.get("due_date"))
    due_bit = f" It's due {due}." if due else ""
    hey = f"Hey {first} — " if first else ""
    open_line = f"{mgr} asked you to take this on." if mgr else "This is still open."
    return (
        f"{hey}{open_line}{due_bit} "
        "I've pinged you twice in Tskflow with no response, so I'm checking in here instead of making them chase you. "
        "Can you take this, or should I tell them you're blocked? Reply like you would to a teammate."
    )


def group_accountability(children: List[dict]) -> dict:
    """Rollup for a 30–40 person assign: received, accepted, silent, pinged twice."""
    kids = [c for c in (children or []) if not c.get("is_parent")]
    viewed = [c for c in kids if c.get("viewed_at") or (c.get("status") or "Pending") != "Pending"]
    accepted = [
        c for c in kids
        if (c.get("status") or "") in ("Accepted", "In Progress", "Review Pending", "Completed", "Blocked")
    ]
    silent = [c for c in kids if (c.get("status") or "Pending") == "Pending"]
    pinged = []
    slack = []
    for c in silent:
        try:
            n = int(c.get("nudge_count") or 0)
        except (TypeError, ValueError):
            n = 0
        if n >= PING_THRESHOLD:
            pinged.append(c)
        if c.get("slack_thread_id"):
            slack.append(c)
    return {
        "total": len(kids),
        "delivered": len(kids),
        "received": len(viewed),
        "accepted": len(accepted),
        "silent": len(silent),
        "pinged_twice": len(pinged),
        "slack_threads": len(slack),
        "pinged_names": [
            c.get("assigned_to_name") or c.get("assigned_to_email") or "Someone" for c in pinged[:12]
        ],
        "silent_names": [
            c.get("assigned_to_name") or c.get("assigned_to_email") or "Someone" for c in silent[:12]
        ],
    }


async def _slack_api(method: str, token: str, payload: dict, http: str = "POST") -> dict:
    if not token:
        return {"ok": False, "error": "no_token"}
    url = f"{SLACK_API}/{method}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if http == "GET":
                r = await client.get(url, headers=headers, params=payload)
            else:
                r = await client.post(url, headers=headers, json=payload)
            data = r.json() if r.content else {}
            if not data.get("ok"):
                logger.warning("Slack %s: %s", method, data.get("error") or r.text[:200])
            return data
    except Exception as e:
        logger.warning("Slack %s failed: %s", method, e)
        return {"ok": False, "error": str(e)}


async def lookup_slack_user_id(token: str, email: str) -> Optional[str]:
    if not token or not email or "@" not in email:
        return None
    data = await _slack_api("users.lookupByEmail", token, {"email": email}, http="GET")
    uid = ((data.get("user") or {}).get("id") if data.get("ok") else None)
    return uid


async def post_slack_message(
    token: str,
    channel: str,
    text: str,
    thread_ts: Optional[str] = None,
    blocks: Optional[List[dict]] = None,
) -> dict:
    payload: Dict[str, Any] = {"channel": channel, "text": text}
    if thread_ts:
        payload["thread_ts"] = thread_ts
    if blocks:
        payload["blocks"] = blocks
    return await _slack_api("chat.postMessage", token, payload)


async def open_dm_channel(token: str, slack_user_id: str) -> Optional[str]:
    data = await _slack_api("conversations.open", token, {"users": slack_user_id})
    if data.get("ok"):
        return (data.get("channel") or {}).get("id")
    return None


def _comment_doc(user: dict, text: str, now: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "user_id": (user or {}).get("id") or "slack-rook",
        "user_name": (user or {}).get("name") or "Rook",
        "content": text,
        "created_at": now,
        "via": "slack",
    }


async def apply_assignee_actions(db, task: dict, actions: List[dict], assignee: dict, now: datetime) -> dict:
    """Mutate the task from interpreted Slack actions. Returns applied update keys."""
    if not task or not actions:
        return {}
    iso = now.isoformat() if hasattr(now, "isoformat") else str(now)
    updates: Dict[str, Any] = {}
    comments = list(task.get("comments") or [])
    status = task.get("status") or "Pending"

    for act in actions:
        kind = (act or {}).get("type")
        if kind == "accept" and status == "Pending":
            updates["status"] = "Accepted"
            updates["accepted_at"] = iso
            status = "Accepted"
        elif kind == "complete":
            updates["status"] = "Completed"
            updates["completed_at"] = iso
            updates["completed_by"] = assignee.get("id")
            updates["completed_by_name"] = assignee.get("name")
            if act.get("note"):
                updates["completion_note"] = str(act["note"])[:2000]
            status = "Completed"
        elif kind == "decline":
            updates["status"] = "Declined"
            updates["reason_for_decline"] = str(act.get("reason") or "Declined via Slack")[:2000]
            status = "Declined"
        elif kind == "block":
            updates["status"] = "Blocked"
            updates["blocked_reason"] = str(act.get("reason") or "Blocked")[:2000]
            updates["blocked_at"] = iso
            status = "Blocked"
        elif kind == "comment" and act.get("note"):
            comments.append(_comment_doc(assignee, str(act["note"])[:2000], iso))

    if comments != (task.get("comments") or []):
        updates["comments"] = comments
    if updates:
        updates["updated_at"] = iso
        await db.tasks.update_one({"id": task["id"]}, {"$set": updates})
    return updates


async def record_ping(db, task: dict, now: datetime, reason: str = "nudge") -> dict:
    """Increment nudge_count. Returns the updated task-shaped dict."""
    if not task or not task.get("id"):
        return task or {}
    iso = now.isoformat() if hasattr(now, "isoformat") else str(now)
    try:
        count = int(task.get("nudge_count") or 0) + 1
    except (TypeError, ValueError):
        count = 1
    await db.tasks.update_one(
        {"id": task["id"]},
        {"$set": {"nudge_count": count, "last_nudge_at": iso, "last_nudge_reason": reason}},
    )
    next_task = dict(task)
    next_task["nudge_count"] = count
    next_task["last_nudge_at"] = iso
    return next_task


def is_live_slack_thread(thread: Optional[dict]) -> bool:
    """True only for follow-ups that were actually delivered as a Slack DM.

    Incoming Webhook / local stubs are one-way or fake — they must not show a
    “Slack thread” card or Catch Up claim that Hound started a Slack conversation.
    """
    if not thread or not isinstance(thread, dict):
        return False
    if thread.get("via") != "slack_dm":
        return False
    return bool(thread.get("slack_channel_id") or thread.get("slack_thread_ts"))


def is_slack_followup_notification(title: Optional[str], body: Optional[str] = None) -> bool:
    """Detect Hound / Rook Slack follow-up notifications (legacy Jarvis copy too)."""
    blob = f"{title or ''} {body or ''}".lower()
    if "slack thread" in blob:
        return True
    if "messaged you on slack" in blob:
        return True
    if "hound" in blob and "slack" in blob:
        return True
    if "rook" in blob and "slack" in blob:
        return True
    if "jarvis" in blob and "slack" in blob:
        return True
    return False


async def open_ignored_task_thread(
    db,
    task: dict,
    assignee: dict,
    assigner: Optional[dict],
    now: datetime,
    post_webhook=None,
    token: Optional[str] = None,
) -> Optional[dict]:
    """Open a Slack DM follow-up after ignored pings.

    Requires a successful Slack bot DM. Incoming Webhook alone is not enough —
    it cannot receive replies, and previously produced fake “Slack thread” UI
    (including via=webhook with no real delivery).
    """
    if not should_open_slack_followup(task):
        return None
    token = (token or slack_bot_token() or "").strip()
    if not token:
        return None
    iso = now.isoformat() if hasattr(now, "isoformat") else str(now)
    text = opening_message(task, assignee.get("name") or "", (assigner or {}).get("name") or "your manager")
    channel_id = None
    thread_ts = None
    slack_user_id = assignee.get("slack_user_id")

    if not slack_user_id:
        slack_user_id = await lookup_slack_user_id(token, assignee.get("email") or "")
        if slack_user_id and assignee.get("id"):
            await db.users.update_one({"id": assignee["id"]}, {"$set": {"slack_user_id": slack_user_id}})
    if slack_user_id:
        channel_id = await open_dm_channel(token, slack_user_id)
    if not channel_id:
        return None
    try:
        from hound import chase_blocks
        blocks = chase_blocks(task, text)
    except Exception:
        blocks = None
    posted = await post_slack_message(token, channel_id, text, blocks=blocks)
    if not posted.get("ok"):
        return None
    thread_ts = posted.get("ts")
    via = "slack_dm"

    # Optional channel FYI via Incoming Webhook — never creates a fake thread by itself.
    if callable(post_webhook):
        try:
            await post_webhook(text)
        except Exception as e:
            logger.warning("webhook follow-up fanout failed: %s", e)

    thread = {
        "id": str(uuid.uuid4()),
        "task_id": task["id"],
        "assignee_id": assignee.get("id"),
        "assigner_id": (assigner or {}).get("id") or task.get("created_by"),
        "slack_user_id": slack_user_id,
        "slack_channel_id": channel_id,
        "slack_thread_ts": thread_ts,
        "status": "open",
        "via": via,
        "ping_count_at_open": int(task.get("nudge_count") or 0),
        "messages": [{"role": "assistant", "text": text, "ts": iso}],
        "created_at": iso,
        "updated_at": iso,
    }
    await db.slack_threads.insert_one(thread)
    await db.tasks.update_one(
        {"id": task["id"]},
        {"$set": {"slack_thread_id": thread["id"], "slack_followup_at": iso, "slack_followup_via": via}},
    )
    return {k: v for k, v in thread.items() if k != "_id"}


async def append_thread_messages(db, thread_id: str, messages: List[dict], now: datetime) -> None:
    iso = now.isoformat() if hasattr(now, "isoformat") else str(now)
    await db.slack_threads.update_one(
        {"id": thread_id},
        {"$push": {"messages": {"$each": messages}}, "$set": {"updated_at": iso}},
    )


async def find_thread_for_slack_event(db, event: dict) -> Optional[dict]:
    channel = (event or {}).get("channel")
    user = (event or {}).get("user")
    thread_ts = (event or {}).get("thread_ts")
    queries: List[dict] = []
    if channel and thread_ts:
        queries.append({"slack_channel_id": channel, "slack_thread_ts": thread_ts})
    if channel:
        queries.append({"slack_channel_id": channel})
    if user:
        queries.append({"slack_user_id": user})
    for q in queries:
        doc = await db.slack_threads.find_one(q, {"_id": 0})
        if doc:
            return doc
    return None


async def process_assignee_slack_event(db, event: dict, now: datetime) -> Optional[dict]:
    """Match an incoming Slack DM/thread reply to a follow-up and update the task."""
    if is_slack_bot_event(event):
        return None
    text = (event.get("text") or "").strip()
    thread = await find_thread_for_slack_event(db, event)
    if not thread:
        return None
    if event.get("ts") and event.get("ts") == thread.get("last_event_ts"):
        return None
    if thread.get("id"):
        await db.slack_threads.update_one(
            {"id": thread["id"]},
            {"$set": {"last_event_ts": event.get("ts")}},
        )
    task = await db.tasks.find_one({"id": thread.get("task_id")}, {"_id": 0})
    if not task:
        return None
    assignee = None
    assigner = None
    if thread.get("assignee_id"):
        assignee = await db.users.find_one({"id": thread["assignee_id"]}, {"_id": 0})
    if thread.get("assigner_id"):
        assigner = await db.users.find_one({"id": thread["assigner_id"]}, {"_id": 0})
    if not assignee:
        return None
    result = await handle_assignee_slack_text(db, thread, task, assignee, assigner, text, now)
    result["task"] = {**task, **(result.get("applied") or {})}
    result["assignee"] = assignee
    result["assigner"] = assigner
    result["thread"] = thread
    return result


async def handle_assignee_slack_text(
    db,
    thread: dict,
    task: dict,
    assignee: dict,
    assigner: Optional[dict],
    text: str,
    now: datetime,
) -> dict:
    parsed = interpret_assignee_reply(text, task, (assigner or {}).get("name") or "your manager")
    parsed = await maybe_llm_interpret(text, task, (assigner or {}).get("name") or "your manager", parsed)
    applied = await apply_assignee_actions(db, task, parsed.get("actions") or [], assignee, now)
    iso = now.isoformat() if hasattr(now, "isoformat") else str(now)
    msgs = [
        {"role": "user", "text": text, "ts": iso},
        {"role": "assistant", "text": parsed["reply"], "ts": iso},
    ]
    await append_thread_messages(db, thread["id"], msgs, now)
    if applied.get("status") in ("Accepted", "Completed", "Declined"):
        await db.slack_threads.update_one({"id": thread["id"]}, {"$set": {"status": "resolved"}})
    token = slack_bot_token()
    if token and thread.get("slack_channel_id"):
        await post_slack_message(
            token,
            thread["slack_channel_id"],
            parsed["reply"],
            thread_ts=thread.get("slack_thread_ts"),
        )
    return {"parsed": parsed, "applied": applied, "reply": parsed["reply"]}
