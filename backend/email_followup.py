"""Email follow-up parallel to Slack nudges.

Uses priority_followup_config() timing. Sends via the existing Resend helper
(passed in). Does not change slack_followup.py.
"""
from __future__ import annotations

import html
import json
import logging
import os
import re
import secrets
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import quote

from phase_helpers import priority_followup_config

logger = logging.getLogger("tskflow.email_followup")

CONFIDENCE_AUTO = 0.75
APPROACH_FRACTION = 0.75
MIN_APPROACH_HOURS = 0.25
TOKEN_RE = re.compile(r"(?:updates|reply|followup)\+([A-Za-z0-9_-]{8,})@", re.I)

_DONE_RE = re.compile(
    r"(?i)\b(done|finished|completed|all set|just (sent|shipped|filed|closed)|marked (it )?complete)\b"
)
_PROGRESS_RE = re.compile(
    r"(?i)\b(in progress|working on (it|this)|still (on it|working)|started|halfway|almost done)\b"
)
_BLOCK_RE = re.compile(r"(?i)\b(blocked|stuck|waiting on|need help|need .+ from)\b")
_MORE_TIME_RE = re.compile(
    r"(?i)\b(need more time|need(?:\s+until)?|until (monday|tuesday|wednesday|thursday|friday|eod|tomorrow|next week)|can'?t finish (today|tonight)|running late)\b"
)


def reply_domain() -> str:
    return (os.getenv("EMAIL_REPLY_DOMAIN") or "notifications.unbiassly.com").strip()


def reply_local() -> str:
    return (os.getenv("EMAIL_REPLY_LOCAL") or "updates").strip() or "updates"


def new_reply_token() -> str:
    return secrets.token_urlsafe(18).replace("-", "").replace("_", "")[:24]


def reply_address(token: str) -> str:
    return f"{reply_local()}+{token}@{reply_domain()}"


def token_from_addresses(addresses: Optional[List[str]]) -> Optional[str]:
    for raw in addresses or []:
        m = TOKEN_RE.search(str(raw or ""))
        if m:
            return m.group(1)
    return None


def approaching_hours(threshold_hours: float) -> float:
    try:
        hours = float(threshold_hours)
    except (TypeError, ValueError):
        hours = 8.0
    return max(MIN_APPROACH_HOURS, hours * APPROACH_FRACTION)


def _parse_ts(iso: Optional[str], now: datetime) -> Optional[datetime]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=now.tzinfo)
        return dt
    except Exception:
        return None


def gap_blocks(last_iso: Optional[str], now: datetime, gap_hours: float) -> bool:
    if not last_iso:
        return False
    last_dt = _parse_ts(last_iso, now)
    if last_dt is None:
        return True
    try:
        return (now - last_dt).total_seconds() < float(gap_hours) * 3600.0
    except Exception:
        return True


def hours_since(iso: Optional[str], now: datetime) -> Optional[float]:
    dt = _parse_ts(iso, now)
    if dt is None:
        return None
    return (now - dt).total_seconds() / 3600.0


def has_assignee_update(task: dict) -> bool:
    """True when the assignee has logged a real update (not just viewed)."""
    status = (task.get("status") or "Pending").strip()
    if status not in ("Pending",):
        return True
    if task.get("accepted_at") or task.get("completed_at") or task.get("blocked_at"):
        return True
    aid = task.get("assigned_to")
    for c in task.get("comments") or []:
        if not isinstance(c, dict):
            continue
        if aid and c.get("user_id") == aid:
            return True
        if (c.get("via") or "") in ("email", "email_reply"):
            return True
    return False


def has_progress_update(task: dict) -> bool:
    status = (task.get("status") or "").strip()
    if status in ("Completed", "Review Pending", "Blocked", "Declined"):
        return True
    if task.get("completion_note"):
        return True
    aid = task.get("assigned_to")
    accepted_iso = task.get("accepted_at") or ""
    for c in task.get("comments") or []:
        if not isinstance(c, dict):
            continue
        via = c.get("via") or ""
        if aid and c.get("user_id") != aid and via not in ("email", "email_reply"):
            continue
        created = str(c.get("created_at") or "")
        if accepted_iso and created and created <= str(accepted_iso):
            continue
        if (c.get("content") or "").strip():
            return True
    return False


def email_channel_allowed(user: Optional[dict], rule: Optional[dict]) -> bool:
    """Respect saved notification prefs. No saved rule → email is on for this sequence."""
    if rule is not None and rule.get("enabled") is False:
        return False
    prefs = (user or {}).get("preferences") or {}
    if prefs.get("email_followups") is False or prefs.get("email_notifications") is False:
        return False
    if rule is None:
        return True
    channels = rule.get("channels")
    if channels is None:
        return True
    return "email" in list(channels)


def followup_kind(task: dict, now: datetime) -> Optional[str]:
    """Return no_response / no_progress when the priority timing window is due."""
    if not task or task.get("is_parent") or task.get("deleted"):
        return None
    status = (task.get("status") or "Pending").strip()
    if status in ("Completed", "Declined", "Draft", "Cancelled", "Rejected"):
        return None
    pcfg = priority_followup_config(task.get("priority"))
    if status == "Pending" and not has_assignee_update(task):
        elapsed = hours_since(task.get("created_at"), now)
        if elapsed is None:
            return None
        if elapsed >= approaching_hours(pcfg["no_response_hours"]):
            return "no_response"
        return None
    if status in ("Accepted", "In Progress") and not has_progress_update(task):
        elapsed = hours_since(task.get("accepted_at") or task.get("created_at"), now)
        if elapsed is None:
            return None
        if elapsed >= approaching_hours(pcfg["no_progress_hours"]):
            return "no_progress"
    return None


def should_send_email_followup(task: dict, user: Optional[dict], rule: Optional[dict], now: datetime) -> Optional[str]:
    if not email_channel_allowed(user, rule):
        return None
    kind = followup_kind(task, now)
    if not kind:
        return None
    pcfg = priority_followup_config(task.get("priority"))
    last = task.get("last_email_followup_at") or task.get("last_smart_reminder_sent")
    if gap_blocks(last, now, pcfg.get("gap_hours") or 12):
        return None
    if pcfg.get("quiet") and hasattr(now, "hour"):
        if not (9 <= now.hour < 18) and (task.get("priority") or "") != "Urgent":
            return None
    return kind


def first_name(name: Optional[str], fallback: str = "there") -> str:
    raw = (name or "").strip()
    if not raw:
        return fallback
    return raw.split()[0]


def followup_copy(kind: str, task: dict, assignee_name: str, assigner_name: str) -> dict:
    """Warm, concise colleague voice — not a system banner."""
    first = first_name(assignee_name)
    mgr = first_name(assigner_name, "your manager")
    title = (task.get("title") or "this").strip()
    due = (task.get("due_date") or "").replace("T", " at ").split(".")[0][:16]
    due_bit = f" It's due {due}." if due else ""
    if kind == "no_progress":
        subject = f"Quick check-in on {title}"
        greeting = f"Hey {first} — just circling back."
        body = (
            f"You accepted {title} and I haven't seen an update yet.{due_bit} "
            f"If you're moving on it, a one-line reply is plenty. "
            f"If something's in the way, say so and I'll let {mgr} know."
        )
    else:
        subject = f"Have you had a chance to look at {title}?"
        greeting = f"Hey {first} — no rush, just a nudge."
        body = (
            f"{mgr} asked you to handle {title}.{due_bit} "
            "I haven't seen a response yet. "
            "Reply to this email with done, still working, blocked, or if you need more time — "
            "I'll update the task from whatever you write."
        )
    return {"subject": subject, "greeting": greeting, "body": body, "kind": kind}


def render_followup_email(
    assignee_name: str,
    assigner_name: str,
    task: dict,
    wording: dict,
    app_url: str,
    reply_addr: str,
) -> str:
    title = html.escape(task.get("title") or "this task")
    first = html.escape(first_name(assignee_name))
    greeting = html.escape(wording.get("greeting") or f"Hey {first},")
    body = html.escape(wording.get("body") or "")
    task_id = quote(str(task.get("id") or ""), safe="")
    base = (app_url or "https://tskflow.com").rstrip("/")
    link = f"{base}/task/{task_id}"
    return f"""<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:28px 20px;">
      <div style="background:#fff;border-radius:18px;padding:28px 28px 22px;box-shadow:0 10px 30px -18px rgba(15,23,42,0.28);">
        <p style="margin:0 0 14px 0;color:#111827;font-size:16px;line-height:1.5;">{greeting}</p>
        <p style="margin:0 0 18px 0;color:#374151;font-size:15px;line-height:1.65;">{body}</p>
        <div style="background:#f8fafc;border-radius:12px;padding:16px 18px;margin:0 0 22px 0;">
          <p style="margin:0;color:#0f172a;font-size:16px;font-weight:600;">{title}</p>
        </div>
        <p style="margin:0 0 22px 0;">
          <a href="{link}" style="display:inline-block;background:#0f172a;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600;">Open the task</a>
        </p>
        <p style="margin:0;color:#64748b;font-size:13px;line-height:1.55;">
          Just reply to this email — I read it. A short note is enough.
        </p>
      </div>
      <p style="margin:14px 8px 0;color:#94a3b8;font-size:11px;text-align:center;">
        Reply goes to {html.escape(reply_addr)}. You can also update the task in TskFlow.
      </p>
    </div>
    </body></html>"""


def interpret_email_reply(text: str) -> dict:
    """Deterministic first pass. Never guesses a status from vague text."""
    raw = (text or "").strip()
    if not raw:
        return {
            "status": None,
            "intent": "unclear",
            "confidence": 0.0,
            "note": "",
            "actions": [],
        }
    note = raw[:2000]
    if _DONE_RE.search(raw) and not _BLOCK_RE.search(raw):
        return {
            "status": "Completed",
            "intent": "done",
            "confidence": 0.9,
            "note": note,
            "actions": [{"type": "complete", "note": note}],
        }
    if _BLOCK_RE.search(raw):
        return {
            "status": "Blocked",
            "intent": "blocked",
            "confidence": 0.88,
            "note": note,
            "actions": [{"type": "block", "reason": note}],
        }
    if _MORE_TIME_RE.search(raw):
        return {
            "status": None,
            "intent": "needs_more_time",
            "confidence": 0.82,
            "note": note,
            "actions": [{"type": "comment", "note": note}],
        }
    if _PROGRESS_RE.search(raw):
        return {
            "status": "In Progress",
            "intent": "in_progress",
            "confidence": 0.86,
            "note": note,
            "actions": [{"type": "in_progress", "note": note}],
        }
    return {
        "status": None,
        "intent": "unclear",
        "confidence": 0.2,
        "note": note,
        "actions": [],
    }


async def maybe_llm_interpret_email(text: str, task: Optional[dict], parsed: dict) -> dict:
    """LLM only when regex is unsure. Must stay below auto-threshold if unclear."""
    if (parsed.get("confidence") or 0) >= CONFIDENCE_AUTO and parsed.get("intent") != "unclear":
        return parsed
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key or not (text or "").strip():
        return parsed
    try:
        from llm import chat_complete

        title = (task or {}).get("title") or "this task"
        prompt = (
            "Extract a task status from an email reply. JSON only, no markdown:\n"
            '{"intent":"done|in_progress|blocked|needs_more_time|unclear",'
            '"confidence":0-1,"note":"short quote or paraphrase"}\n'
            "done = they finished. in_progress = they started / still working. "
            "blocked = stuck. needs_more_time = they can do it but need longer. "
            "unclear = you are not sure — do NOT guess. confidence must be < 0.6 if unclear.\n"
            f"Task: {title}\nReply: {text[:1500]}"
        )
        raw = await chat_complete(
            model="gpt-4o",
            system="You classify assignee email replies. Never invent a status.",
            user=prompt,
            json_mode=True,
            api_key=key,
        )
        blob = (raw if isinstance(raw, str) else str(raw)).strip()
        if blob.startswith("```"):
            blob = re.sub(r"^```(?:json)?\s*|\s*```$", "", blob).strip()
        data = json.loads(blob)
        intent = str(data.get("intent") or "unclear").strip().lower()
        try:
            conf = float(data.get("confidence") or 0)
        except (TypeError, ValueError):
            conf = 0.0
        note = (data.get("note") or text or "").strip()[:2000]
        if intent not in ("done", "in_progress", "blocked", "needs_more_time"):
            intent = "unclear"
            conf = min(conf, 0.4)
        actions: List[dict] = []
        status = None
        if intent == "done":
            status = "Completed"
            actions = [{"type": "complete", "note": note}]
        elif intent == "blocked":
            status = "Blocked"
            actions = [{"type": "block", "reason": note}]
        elif intent == "in_progress":
            status = "In Progress"
            actions = [{"type": "in_progress", "note": note}]
        elif intent == "needs_more_time":
            actions = [{"type": "comment", "note": note}]
        return {"status": status, "intent": intent, "confidence": conf, "note": note, "actions": actions}
    except Exception as e:
        logger.warning("LLM email interpret skipped: %s", e)
        return parsed


def _comment_doc(user: dict, text: str, now: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "user_id": (user or {}).get("id") or "email-reply",
        "user_name": (user or {}).get("name") or "Assignee",
        "content": text,
        "created_at": now,
        "via": "email_reply",
    }


async def apply_email_reply_actions(db, task: dict, actions: List[dict], assignee: dict, now: datetime) -> dict:
    if not task or not actions:
        return {}
    iso = now.isoformat() if hasattr(now, "isoformat") else str(now)
    updates: Dict[str, Any] = {}
    comments = list(task.get("comments") or [])
    status = task.get("status") or "Pending"

    for act in actions:
        kind = (act or {}).get("type")
        if kind == "complete":
            updates["status"] = "Completed"
            updates["completed_at"] = iso
            updates["completed_by"] = assignee.get("id")
            updates["completed_by_name"] = assignee.get("name")
            if act.get("note"):
                updates["completion_note"] = str(act["note"])[:2000]
            status = "Completed"
        elif kind == "block":
            updates["status"] = "Blocked"
            updates["blocked_reason"] = str(act.get("reason") or "Blocked")[:2000]
            updates["blocked_at"] = iso
            status = "Blocked"
        elif kind == "in_progress":
            if status == "Pending":
                updates["accepted_at"] = iso
            updates["status"] = "In Progress"
            status = "In Progress"
        elif kind == "comment" and act.get("note"):
            comments.append(_comment_doc(assignee, str(act["note"])[:2000], iso))

    note_for_log = None
    for act in actions:
        if act.get("note") or act.get("reason"):
            note_for_log = str(act.get("note") or act.get("reason"))
            break
    if note_for_log and not any(c.get("content") == note_for_log[:2000] for c in comments):
        prefix = "Updated from an email reply: "
        comments.append(_comment_doc(assignee, (prefix + note_for_log)[:2000], iso))

    if comments != (task.get("comments") or []):
        updates["comments"] = comments
    if updates:
        updates["updated_at"] = iso
        updates["email_reply_applied_at"] = iso
        await db.tasks.update_one({"id": task["id"]}, {"$set": updates})
    return updates


async def flag_email_reply_for_review(
    db,
    task: dict,
    assignee: dict,
    assigner: Optional[dict],
    parsed: dict,
    raw_text: str,
    now: datetime,
) -> dict:
    iso = now.isoformat() if hasattr(now, "isoformat") else str(now)
    review = {
        "id": str(uuid.uuid4()),
        "from_user_id": assignee.get("id"),
        "from_name": assignee.get("name"),
        "from_email": assignee.get("email"),
        "text": (raw_text or "")[:2000],
        "intent": parsed.get("intent"),
        "confidence": parsed.get("confidence"),
        "created_at": iso,
        "status": "pending",
        "via": "email_reply",
    }
    await db.tasks.update_one(
        {"id": task["id"]},
        {"$set": {"email_reply_review": review, "updated_at": iso}},
    )
    if assigner and assigner.get("id"):
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": assigner["id"],
            "type": "nudge",
            "title": "Email reply needs a look",
            "body": (
                f"{assignee.get('name') or 'Someone'} replied about "
                f"{task.get('title') or 'a task'}, but I wasn't confident enough to update it."
            ),
            "task_id": task["id"],
            "read": False,
            "delivered": True,
            "created_at": iso,
        })
    return review


async def record_email_followup(db, task: dict, token: str, kind: str, now: datetime) -> dict:
    iso = now.isoformat() if hasattr(now, "isoformat") else str(now)
    try:
        count = int(task.get("email_followup_count") or 0) + 1
    except (TypeError, ValueError):
        count = 1
    await db.tasks.update_one(
        {"id": task["id"]},
        {"$set": {
            "last_email_followup_at": iso,
            "email_followup_count": count,
            "email_reply_token": token,
            "last_email_followup_kind": kind,
        }},
    )
    await db.email_followup_tokens.insert_one({
        "id": token,
        "task_id": task["id"],
        "assignee_id": task.get("assigned_to"),
        "assignee_email": task.get("assigned_to_email"),
        "kind": kind,
        "created_at": iso,
    })
    next_task = dict(task)
    next_task["last_email_followup_at"] = iso
    next_task["email_followup_count"] = count
    next_task["email_reply_token"] = token
    return next_task


async def sweep_email_followups(
    db,
    now: datetime,
    send_email: Callable[..., Any],
    app_url: str,
) -> int:
    """Send approaching no-response / no-progress emails. Parallel to Slack."""
    sent = 0
    try:
        tasks = await db.tasks.find({
            "status": {"$nin": ["Completed", "Declined", "Draft", "Cancelled", "Rejected"]},
            "deleted": {"$ne": True},
            "is_parent": {"$ne": True},
        }, {"_id": 0}).to_list(1000)
        user_ids = list({
            t.get("assigned_to") for t in tasks
            if t.get("assigned_to") and not str(t.get("assigned_to")).startswith("email_")
        })
        users_by_id: Dict[str, dict] = {}
        if user_ids:
            async for u in db.users.find(
                {"id": {"$in": user_ids}},
                {"_id": 0, "id": 1, "email": 1, "name": 1, "deleted": 1, "preferences": 1, "company_domain": 1},
            ):
                users_by_id[u["id"]] = u
        creator_ids = list({t.get("created_by") for t in tasks if t.get("created_by")})
        creators: Dict[str, dict] = {}
        if creator_ids:
            async for u in db.users.find(
                {"id": {"$in": creator_ids}},
                {"_id": 0, "id": 1, "name": 1, "email": 1},
            ):
                creators[u["id"]] = u
        rules_by_user: Dict[str, dict] = {}
        async for r in db.reminder_rules.find({}, {"_id": 0}):
            if r.get("user_id"):
                rules_by_user[r["user_id"]] = r

        for t in tasks:
            aid = t.get("assigned_to")
            if not aid or str(aid).startswith("email_"):
                continue
            user = users_by_id.get(aid)
            if not user or user.get("deleted") or not user.get("email"):
                continue
            if t.get("assigned_to") and t.get("assigned_to") == t.get("created_by") and (t.get("status") or "Pending") == "Pending":
                # Self-assigned starts accepted; skip no-response pings
                continue
            rule = rules_by_user.get(aid)
            kind = should_send_email_followup(t, user, rule, now)
            if not kind:
                continue
            token = new_reply_token()
            addr = reply_address(token)
            assigner = creators.get(t.get("created_by") or "") or {}
            wording = followup_copy(kind, t, user.get("name") or "", assigner.get("name") or "your manager")
            html_body = render_followup_email(
                user.get("name") or "",
                assigner.get("name") or "your manager",
                t,
                wording,
                app_url,
                addr,
            )
            ok = await send_email(user["email"], wording["subject"], html_body, reply_to=addr)
            if not ok:
                continue
            pinged = await record_email_followup(db, t, token, kind, now)
            try:
                from activity_helpers import log_task_activity
                await log_task_activity(
                    db,
                    task_id=t["id"],
                    event_type="reminder",
                    channel="email",
                    actor_name="Email follow-up",
                    recipient_id=aid,
                    recipient_name=user.get("name"),
                    recipient_email=user.get("email"),
                    company_domain=user.get("company_domain") or t.get("company_domain"),
                    title=wording["subject"],
                    body=f"{t.get('title')} — email {kind.replace('_', ' ')}",
                    meta={"fired_kind": kind, "via": "email_followup", "reply_token": token},
                    created_at=now.isoformat() if hasattr(now, "isoformat") else str(now),
                )
            except Exception as log_err:
                logger.warning("email follow-up activity log failed: %s", log_err)
            sent += 1
            _ = pinged
    except Exception as e:
        logger.error("sweep_email_followups: %s", e)
    return sent


def verify_resend_webhook(payload: bytes, headers: dict, secret: str) -> bool:
    if not secret:
        return False
    try:
        import resend
        resend.Webhooks.verify({
            "payload": payload.decode("utf-8") if isinstance(payload, (bytes, bytearray)) else str(payload),
            "headers": {
                "id": headers.get("svix-id") or headers.get("id") or "",
                "timestamp": headers.get("svix-timestamp") or headers.get("timestamp") or "",
                "signature": headers.get("svix-signature") or headers.get("signature") or "",
            },
            "webhook_secret": secret,
        })
        return True
    except Exception as e:
        logger.warning("Resend webhook verify failed: %s", e)
        return False


def fetch_received_email(email_id: str) -> dict:
    if not email_id:
        return {}
    try:
        import resend
        data = resend.Emails.Receiving.get(email_id)
        if isinstance(data, dict):
            return data
        return {
            "id": getattr(data, "id", email_id),
            "from": getattr(data, "from", None) or (data.get("from") if hasattr(data, "get") else None),
            "to": getattr(data, "to", None) or [],
            "subject": getattr(data, "subject", None) or "",
            "text": getattr(data, "text", None) or "",
            "html": getattr(data, "html", None) or "",
        }
    except Exception as e:
        logger.warning("fetch received email failed: %s", e)
        return {}


def strip_quoted_reply(text: str) -> str:
    s = (text or "").replace("\r\n", "\n")
    s = re.split(r"\nOn .+wrote:\n", s, maxsplit=1)[0]
    s = re.split(r"\n-+ ?Original Message ?-+\n", s, maxsplit=1, flags=re.I)[0]
    s = re.split(r"\n>+ ", s, maxsplit=1)[0]
    return s.strip()


def html_to_text(blob: str) -> str:
    s = re.sub(r"(?i)<br\s*/?>", "\n", blob or "")
    s = re.sub(r"(?i)</p>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"[ \t]{2,}", " ", s)).strip()


async def process_inbound_email(db, event: dict, now: datetime) -> Optional[dict]:
    """Map a Resend inbound event to a task update or manager review flag."""
    data = (event or {}).get("data") or event or {}
    email_id = data.get("email_id") or data.get("id")
    to_addrs = list(data.get("to") or []) + list(data.get("received_for") or [])
    token = token_from_addresses(to_addrs)
    fetched = fetch_received_email(email_id) if email_id else {}
    if fetched:
        to_addrs = list(fetched.get("to") or to_addrs)
        token = token or token_from_addresses(to_addrs)
    if not token:
        return {"ok": False, "reason": "no_token"}
    rec = await db.email_followup_tokens.find_one({"id": token}, {"_id": 0})
    task = None
    if rec:
        task = await db.tasks.find_one({"id": rec.get("task_id")}, {"_id": 0})
    if not task:
        task = await db.tasks.find_one({"email_reply_token": token}, {"_id": 0})
    if not task:
        return {"ok": False, "reason": "unknown_token", "token": token}

    text = strip_quoted_reply(
        (fetched.get("text") or "")
        or html_to_text(fetched.get("html") or "")
        or (data.get("text") or "")
        or html_to_text(data.get("html") or "")
        or (data.get("subject") or fetched.get("subject") or "")
    )
    assignee = None
    assigner = None
    if task.get("assigned_to"):
        assignee = await db.users.find_one({"id": task["assigned_to"]}, {"_id": 0})
    if task.get("created_by"):
        assigner = await db.users.find_one({"id": task["created_by"]}, {"_id": 0})
    if not assignee:
        return {"ok": False, "reason": "no_assignee", "task_id": task.get("id")}

    parsed = interpret_email_reply(text)
    parsed = await maybe_llm_interpret_email(text, task, parsed)
    confident = (parsed.get("confidence") or 0) >= CONFIDENCE_AUTO and parsed.get("intent") != "unclear" and (
        parsed.get("actions") or parsed.get("status")
    )
    if confident:
        applied = await apply_email_reply_actions(db, task, parsed.get("actions") or [], assignee, now)
        return {
            "ok": True,
            "auto": True,
            "task_id": task["id"],
            "parsed": parsed,
            "applied": applied,
        }
    review = await flag_email_reply_for_review(db, task, assignee, assigner, parsed, text, now)
    return {
        "ok": True,
        "auto": False,
        "review": True,
        "task_id": task["id"],
        "parsed": parsed,
        "review_id": review.get("id"),
    }
