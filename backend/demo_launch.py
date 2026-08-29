"""Guest launch from the landing page: parse the ask, build the guest, seed the robot room.

Pure helpers only — the endpoint in server.py owns Mongo and email sending.
"""
import re
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

GUEST_EMAIL_DOMAIN = "tskflow.guest"
GUEST_NAME = "You"
GUEST_TTL_HOURS = 72
LAUNCHES_PER_HOUR = 5
EOD_HOUR = 17  # 5 PM Pacific

# Used when a visitor sends without naming an assignee — nothing real is mailed.
SAMPLE_ASSIGNEE = {"email": "chris.park@example.com", "name": "Chris Park"}

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")

_LEAD_VERBS = re.compile(
    r"^(?:please\s+|kindly\s+)?(?:can\s+you\s+)?"
    r"(?:ask|tell|have|get|remind|inform|assign|nudge)\s+"
    r"(?:(?:my|the|our)\s+)?"
    r"(?:team|direct reports|reports|everyone|him|her|them|manager|org|entire org|sales|engineering)\s+"
    r"(?:to|that)\s+",
    re.IGNORECASE,
)
_ASSIGN_PREFIX = re.compile(r"^assign\s+.+?\s+to\s+", re.IGNORECASE)


def normalize_assignee_email(raw: Optional[str]) -> str:
    return str(raw or "").strip().strip("<>").lower()


def is_valid_assignee_email(raw: Optional[str]) -> bool:
    email = normalize_assignee_email(raw)
    if not email or len(email) > 254:
        return False
    if email.endswith("." + GUEST_EMAIL_DOMAIN) or email.endswith("@" + GUEST_EMAIL_DOMAIN):
        return False
    return bool(_EMAIL_RE.match(email))


def demo_channel(raw: Optional[str]) -> str:
    """Email is the only channel a guest can actually send on. Slack needs a connect."""
    return "slack" if str(raw or "").strip().lower() == "slack" else "email"


def guest_email(token: Optional[str] = None) -> str:
    slug = (token or uuid.uuid4().hex)[:12]
    return f"demo+{slug}@{GUEST_EMAIL_DOMAIN}"


def guest_company_domain(guest_id: str) -> str:
    """Per-guest domain so two guests can never see each other's task activity."""
    return f"guest-{str(guest_id or uuid.uuid4().hex)[:8]}.{GUEST_EMAIL_DOMAIN}"


def guest_expires_at(now: datetime) -> str:
    return (now + timedelta(hours=GUEST_TTL_HOURS)).isoformat()


def eod_due_date(now: datetime) -> str:
    """End of day today in the app's due-date format; rolls to tomorrow after 5 PM."""
    target = now if now.hour < EOD_HOUR else now + timedelta(days=1)
    return target.strftime(f"%Y-%m-%dT{EOD_HOUR:02d}:00")


def launch_rate_limited(recent_launches: int, limit: int = LAUNCHES_PER_HOUR) -> bool:
    return int(recent_launches or 0) >= int(limit)


def assignee_display_name(email: str) -> str:
    local = str(email or "").split("@")[0]
    parts = [p for p in re.split(r"[._\-+]+", local) if p and not p.isdigit()]
    if not parts:
        return str(email or "there")
    return " ".join(p[:1].upper() + p[1:] for p in parts[:2])


def split_task_text(raw: str) -> Tuple[str, Optional[str]]:
    """Turn a plain-English ask into (title, description).

    Keeps the manager's own words — only trims the "tell my team to" scaffolding.
    """
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    if not text:
        return "", None
    body = _LEAD_VERBS.sub("", text)
    if body == text:
        body = _ASSIGN_PREFIX.sub("", text)
    body = re.sub(r"^(?:please|kindly)\s+", "", body, flags=re.IGNORECASE).strip()
    body = body or text

    first = re.split(r"(?<=[.!?])\s+", body)[0].strip().rstrip(".")
    if len(first) > 90:
        cut = first[:90].rsplit(" ", 1)[0]
        first = (cut or first[:90]).rstrip(",;:")
    title = (first[:1].upper() + first[1:]) if first else "Please take this on"
    description = text if text.rstrip(".") != title.rstrip(".") else None
    return title, description


def robot_room_beats(
    *,
    task_title: str,
    assignee_name: str,
    manager_name: str = "you",
    channel: str = "email",
    delivered: bool = True,
) -> List[Dict[str, str]]:
    """Polite robot beats so the room is never empty while the assignee is quiet."""
    who = assignee_name or "your assignee"
    ask = (task_title or "the ask").rstrip(".")
    sent_line = (
        f"Delivered the ask to {who} by email. No chasing needed from {manager_name}."
        if delivered
        else f"Queued the ask for {who}. Add a real email and I will deliver it."
    )
    beats = [
        {
            "event_type": "robot_note",
            "channel": "email" if delivered else "in_app",
            "title": "Ask delivered" if delivered else "Ask queued",
            "body": sent_line,
        },
        {
            "event_type": "robot_note",
            "channel": "in_app",
            "title": "Waiting on a reply",
            "body": f"I am watching for {who} to accept \u201c{ask}\u201d. You do not have to check in.",
        },
        {
            "event_type": "robot_note",
            "channel": "email",
            "title": "Polite ping scheduled",
            "body": f"If {who} stays quiet, I send one gentle reminder before the due time - not five.",
        },
        {
            "event_type": "robot_note",
            "channel": "slack",
            "title": "Slack follow-up available",
            "body": (
                "Connect Slack and I will open a thread with them after two ignored pings, "
                "so you never write \u201cjust circling back\u201d again."
            ),
        },
    ]
    if channel == "slack":
        beats[-1]["body"] = (
            "You picked Slack. Connect it in this room and I will move the follow-up there."
        )
    return beats


def guest_user_doc(
    *,
    guest_id: str,
    now: datetime,
    ip_hash: Optional[str] = None,
    email: Optional[str] = None,
) -> dict:
    """The throwaway account behind a landing launch. Verified so nothing blocks the room."""
    stamp = now.isoformat()
    return {
        "id": guest_id,
        "name": GUEST_NAME,
        "email": email or guest_email(guest_id),
        "subscription_tier": "free",
        "company_domain": guest_company_domain(guest_id),
        "email_verified": True,
        "is_guest": True,
        "guest_expires_at": guest_expires_at(now),
        "guest_ip_hash": ip_hash,
        "source": "landing_demo",
        "is_team_owner": False,
        "team_owner_email": None,
        "created_at": stamp,
        "last_active": stamp,
        "last_login": stamp,
    }


def room_copy(*, assignee_name: str, delivered: bool) -> dict:
    """Copy for the guest task page after a landing send."""
    who = assignee_name or "your assignee"
    return {
        "headline": "Your ask is on its way",
        "sub": (
            f"It went to {who}. TskFlow follows up politely and reports back."
            if delivered
            else f"This is a sample send to {who}. Add a real email next time and it goes out."
        ),
        "reassurance": "You will not have to write \u201cjust circling back\u201d again.",
    }
