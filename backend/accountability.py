"""Per-person accountability score from assigned work.

The score answers: did they respond, did they finish, and did they leave work sitting?
Computed on read from task documents — nothing is stored on the user.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

RESPONDED_STATUSES = {
    "Accepted",
    "Declined",
    "Counter-Proposed",
    "Completed",
    "Review Pending",
    "Blocked",
}
DONE_STATUSES = {"Completed"}
CLOSED_STATUSES = {"Completed", "Declined"}


def parse_dt(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    try:
        text = str(raw).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def is_overdue(task: dict, now: datetime) -> bool:
    if (task.get("status") or "") in CLOSED_STATUSES:
        return False
    due = parse_dt(task.get("due_date"))
    if due is None:
        return False
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return due < now


def summarize_assignee_tasks(tasks: Iterable[dict], now: Optional[datetime] = None) -> Dict[str, Any]:
    """Rates for one assignee from the tasks assigned to them."""
    now = now or datetime.now(timezone.utc)
    rows: List[dict] = []
    for task in tasks or []:
        if task.get("deleted") and not task.get("completed_at"):
            continue
        rows.append(task)

    assigned = len(rows)
    completed = [t for t in rows if (t.get("status") or "") in DONE_STATUSES]
    responded = [t for t in rows if (t.get("status") or "") in RESPONDED_STATUSES]
    silent = [t for t in rows if (t.get("status") or "") == "Pending"]
    overdue_open = [t for t in rows if is_overdue(t, now)]
    nudge_total = sum(int(t.get("nudge_count") or 0) for t in rows)

    completion_rate = round((len(completed) / assigned) * 100, 1) if assigned else 0.0
    response_rate = round((len(responded) / assigned) * 100, 1) if assigned else 0.0
    silent_rate = round((len(silent) / assigned) * 100, 1) if assigned else 0.0
    overdue_rate = round((len(overdue_open) / assigned) * 100, 1) if assigned else 0.0
    avg_nudges = round(nudge_total / assigned, 2) if assigned else 0.0

    return {
        "tasks_assigned": assigned,
        "tasks_completed": len(completed),
        "tasks_responded": len(responded),
        "tasks_silent": len(silent),
        "tasks_overdue_open": len(overdue_open),
        "nudge_total": nudge_total,
        "avg_nudges": avg_nudges,
        "completion_rate": completion_rate,
        "response_rate": response_rate,
        "silent_rate": silent_rate,
        "overdue_rate": overdue_rate,
    }


def follow_through_score(summary: dict) -> float:
    """100 when nothing is sitting unanswered or overdue; drops as work is ignored."""
    follow = 100.0
    follow -= min(45.0, float(summary.get("silent_rate") or 0) * 0.7)
    follow -= min(35.0, float(summary.get("overdue_rate") or 0) * 0.55)
    follow -= min(20.0, float(summary.get("avg_nudges") or 0) * 8.0)
    return max(0.0, min(100.0, follow))


def compute_accountability_score(summary: dict) -> Optional[int]:
    """0–100 blend of execute / respond / not-leave-it-sitting. None if no history."""
    if not int(summary.get("tasks_assigned") or 0):
        return None
    execute = float(summary.get("completion_rate") or 0)
    respond = float(summary.get("response_rate") or 0)
    follow = follow_through_score(summary)
    return int(round(0.40 * execute + 0.35 * respond + 0.25 * follow))


def accountability_label(score: Optional[int]) -> str:
    if score is None:
        return "No history"
    if score >= 85:
        return "Strong"
    if score >= 70:
        return "Steady"
    if score >= 50:
        return "Uneven"
    return "Needs follow-up"


def score_assignee_tasks(tasks: Iterable[dict], now: Optional[datetime] = None) -> Dict[str, Any]:
    summary = summarize_assignee_tasks(tasks, now=now)
    score = compute_accountability_score(summary)
    follow = round(follow_through_score(summary), 1) if summary["tasks_assigned"] else None
    return {
        **summary,
        "accountability_score": score,
        "accountability_label": accountability_label(score),
        "parts": {
            "execute": summary["completion_rate"],
            "respond": summary["response_rate"],
            "follow_through": follow,
        },
    }
