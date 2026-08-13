"""Task activity logging + CSV export helpers."""
import csv
import io
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional


async def log_task_activity(
    db,
    *,
    task_id: str,
    event_type: str,
    channel: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    recipient_id: Optional[str] = None,
    recipient_name: Optional[str] = None,
    recipient_email: Optional[str] = None,
    company_domain: Optional[str] = None,
    title: Optional[str] = None,
    body: Optional[str] = None,
    meta: Optional[dict] = None,
    created_at: Optional[str] = None,
) -> dict:
    """Persist one activity row for a task (reminders, nudges, chatter, etc.)."""
    now = created_at or datetime.utcnow().isoformat() + "Z"
    doc = {
        "id": str(uuid.uuid4()),
        "task_id": task_id,
        "event_type": event_type,
        "channel": channel,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "recipient_id": recipient_id,
        "recipient_name": recipient_name,
        "recipient_email": recipient_email,
        "company_domain": company_domain,
        "title": title,
        "body": body,
        "meta": meta or {},
        "created_at": now,
    }
    await db.task_activity.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


def _csv_escape(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, (list, dict)):
        import json
        return json.dumps(val, ensure_ascii=False)
    return str(val).replace("\r", " ").replace("\n", " ").strip()


def tasks_to_csv_rows(
    tasks: List[dict],
    activity_by_task: Dict[str, List[dict]],
    user_names: Dict[str, str],
) -> List[dict]:
    """Flatten tasks + reminder/chatter activity into exportable row dicts."""
    rows = []
    for t in tasks:
        tid = t.get("id") or ""
        assigner_id = t.get("created_by")
        assignee_id = t.get("assigned_to")
        acts = activity_by_task.get(tid, [])
        reminder_acts = [a for a in acts if a.get("event_type") in ("reminder", "nudge")]
        chatter_acts = [a for a in acts if a.get("event_type") == "chatter"]
        comments = t.get("comments") or []
        reminder_summary = " | ".join(
            f"{a.get('created_at','')[:16]} {a.get('channel') or '-'} {a.get('title') or a.get('event_type')}"
            for a in reminder_acts[:50]
        )
        chatter_summary = " | ".join(
            f"{a.get('created_at','')[:16]} {a.get('actor_name') or ''}: {(a.get('body') or '')[:80]}"
            for a in chatter_acts[:50]
        )
        if not chatter_summary and comments:
            chatter_summary = " | ".join(
                f"{(c.get('created_at') or '')[:16]} {c.get('user_name') or ''}: {(c.get('content') or '')[:80]}"
                for c in comments[:50]
            )
        rows.append({
            "task_id": tid,
            "title": t.get("title") or "",
            "description": t.get("description") or "",
            "status": t.get("status") or "",
            "priority": t.get("priority") or "",
            "category": t.get("category") or "",
            "success_criteria": t.get("success_criteria") or "",
            "assigner_id": assigner_id or "",
            "assigner_name": user_names.get(assigner_id or "", t.get("created_by_name") or ""),
            "assignee_id": assignee_id or "",
            "assignee_name": user_names.get(assignee_id or "", t.get("assigned_to_name") or ""),
            "assignee_email": t.get("assigned_to_email") or "",
            "due_date": t.get("due_date") or "",
            "created_at": t.get("created_at") or "",
            "accepted_at": t.get("accepted_at") or "",
            "completed_at": t.get("completed_at") or "",
            "viewed_at": t.get("viewed_at") or "",
            "blocked_at": t.get("blocked_at") or "",
            "block_reason": t.get("block_reason") or "",
            "completion_note": t.get("completion_note") or "",
            "parent_id": t.get("parent_id") or "",
            "is_parent": bool(t.get("is_parent")),
            "is_sales_task": bool(t.get("is_sales_task")),
            "reminders_sent_count": len(reminder_acts),
            "last_smart_reminder_sent": t.get("last_smart_reminder_sent") or "",
            "reminders_log": reminder_summary,
            "chatter_count": len(chatter_acts) or len(comments),
            "chatter_log": chatter_summary,
            "company_domain": t.get("company_domain") or "",
        })
    return rows


def rows_to_csv(rows: List[dict], fieldnames: Optional[List[str]] = None) -> str:
    if not rows:
        fieldnames = fieldnames or [
            "task_id", "title", "description", "status", "priority", "category",
            "assigner_name", "assignee_name", "assignee_email", "due_date",
            "created_at", "completed_at", "reminders_sent_count", "reminders_log",
            "chatter_count", "chatter_log",
        ]
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        return buf.getvalue()
    fieldnames = fieldnames or list(rows[0].keys())
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: _csv_escape(row.get(k)) for k in fieldnames})
    return buf.getvalue()
