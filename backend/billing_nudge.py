"""Nudge for paid plans only after real send/receive usage over time."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

MIN_ACCOUNT_DAYS = 14
MIN_SENT = 5
MIN_RECEIVED = 3
MIN_SPAN_DAYS = 7


def billing_nudge_ready(
    *,
    account_days: float,
    sent: int,
    received: int,
    span_days: float,
) -> bool:
    """True when they have used the loop with other people for a while."""
    return (
        account_days >= MIN_ACCOUNT_DAYS
        and sent >= MIN_SENT
        and received >= MIN_RECEIVED
        and span_days >= MIN_SPAN_DAYS
    )


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def account_age_days(created_at: Any, now: datetime) -> float:
    dt = _parse_dt(created_at)
    if not dt:
        return 0.0
    return max(0.0, (now - dt).total_seconds() / 86400.0)


def activity_span_days(first: Any, last: Any) -> float:
    a, b = _parse_dt(first), _parse_dt(last)
    if not a or not b:
        return 0.0
    return max(0.0, abs((b - a).total_seconds()) / 86400.0)


async def show_billing_nudge(db, user: dict, now: Optional[datetime] = None) -> bool:
    if not user or user.get("subscription_tier") != "free":
        return False
    now = now or datetime.now(timezone.utc)
    uid = user.get("id")
    if not uid:
        return False
    not_deleted = {"deleted": {"$ne": True}}
    sent = await db.tasks.count_documents(
        {**not_deleted, "created_by": uid, "assigned_to": {"$ne": uid}}
    )
    received = await db.tasks.count_documents(
        {**not_deleted, "assigned_to": uid, "created_by": {"$ne": uid}}
    )
    if sent < MIN_SENT or received < MIN_RECEIVED:
        return False
    age = account_age_days(user.get("created_at"), now)
    if age < MIN_ACCOUNT_DAYS:
        return False
    collab = {
        **not_deleted,
        "$or": [
            {"created_by": uid, "assigned_to": {"$ne": uid}},
            {"assigned_to": uid, "created_by": {"$ne": uid}},
        ],
    }
    first_docs = await db.tasks.find(collab, {"_id": 0, "created_at": 1}).sort("created_at", 1).to_list(1)
    last_docs = await db.tasks.find(collab, {"_id": 0, "created_at": 1}).sort("created_at", -1).to_list(1)
    first_at = first_docs[0].get("created_at") if first_docs else None
    last_at = last_docs[0].get("created_at") if last_docs else None
    return billing_nudge_ready(
        account_days=age,
        sent=int(sent),
        received=int(received),
        span_days=activity_span_days(first_at, last_at),
    )
