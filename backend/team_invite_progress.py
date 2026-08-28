"""Team invite funnel: invited → opened → signed up → verified → logged in → ready."""
from datetime import datetime, timezone

STAGES = (
    ("invited", "Invited"),
    ("opened", "Opened invite"),
    ("signed_up", "Signed up"),
    ("verified", "Verified"),
    ("logged_in", "Logged in"),
    ("ready", "Set up"),
)
STAGE_RANK = {key: i for i, (key, _) in enumerate(STAGES)}
STAGE_LABEL = dict(STAGES)


def parse_ts(value):
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def derive_invite_stage(user=None, invite=None):
    if user:
        prefs = user.get("preferences") or {}
        if prefs.get("team_setup_complete"):
            return "ready"
        if user.get("last_login"):
            return "logged_in"
        if user.get("email_verified"):
            return "verified"
        return "signed_up"
    if invite and invite.get("clicked_at"):
        return "opened"
    return "invited"


def format_join_pace(seconds):
    if seconds is None or seconds < 0:
        return None
    seconds = int(seconds)
    if seconds < 60:
        return "under a minute"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    rem_m = minutes % 60
    if hours < 48:
        return f"{hours}h {rem_m}m" if rem_m else f"{hours}h"
    days = hours // 24
    return f"{days}d"


def _finish_ts(user, stage):
    if not user:
        return None
    if stage in ("logged_in", "ready"):
        return parse_ts(user.get("last_login") or user.get("created_at"))
    if stage == "verified":
        return parse_ts(user.get("verified_at") or user.get("created_at"))
    if stage == "signed_up":
        return parse_ts(user.get("created_at"))
    return None


def build_invite_progress_rows(invites, users, extra_emails=None, viewer_email=None):
    """Merge invitations, teammates, and claimed emails into ranked rows."""
    invites = list(invites or [])
    users = list(users or [])
    extra_emails = [str(e).strip().lower() for e in (extra_emails or []) if e]
    viewer = (viewer_email or "").strip().lower()

    by_email_invite = {}
    for inv in invites:
        email = str(inv.get("email") or "").strip().lower()
        if not email or email == viewer:
            continue
        prev = by_email_invite.get(email)
        if not prev or (parse_ts(inv.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= (
            parse_ts(prev.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)
        ):
            by_email_invite[email] = {**inv, "email": email}

    by_email_user = {}
    for user in users:
        email = str(user.get("email") or "").strip().lower()
        if not email or email == viewer:
            continue
        by_email_user[email] = user

    emails = set(by_email_invite) | set(by_email_user) | set(extra_emails)
    emails.discard(viewer)
    rows = []
    for email in emails:
        invite = by_email_invite.get(email)
        user = by_email_user.get(email)
        stage = derive_invite_stage(user=user, invite=invite)
        start = parse_ts((invite or {}).get("created_at") or (user or {}).get("created_at"))
        finish = _finish_ts(user, stage)
        waiting = stage in ("invited", "opened")
        pace_seconds = None
        if start and finish and not waiting:
            pace_seconds = max(0, int((finish - start).total_seconds()))
        name = (user or {}).get("name") or (invite or {}).get("name") or email.split("@")[0]
        rows.append({
            "email": email,
            "name": name,
            "stage": stage,
            "stage_label": STAGE_LABEL[stage],
            "waiting": waiting,
            "pace_seconds": pace_seconds,
            "pace_label": format_join_pace(pace_seconds) if pace_seconds is not None else None,
            "invited_at": (invite or {}).get("created_at") or (user or {}).get("created_at"),
            "opened_at": (invite or {}).get("clicked_at"),
            "signed_up_at": (user or {}).get("created_at"),
            "logged_in_at": (user or {}).get("last_login"),
            "ready": stage == "ready",
        })

    rows.sort(key=lambda r: (
        1 if r["waiting"] else 0,
        r["pace_seconds"] if r["pace_seconds"] is not None else 10**12,
        r["email"],
    ))
    for i, row in enumerate(rows, start=1):
        row["rank"] = i
        if row["waiting"]:
            row["badge"] = "Still out"
        elif i == 1:
            row["badge"] = "Fastest"
        else:
            row["badge"] = None
    in_count = sum(1 for r in rows if not r["waiting"])
    return {
        "rows": rows,
        "summary": {
            "total": len(rows),
            "in": in_count,
            "waiting": len(rows) - in_count,
            "opened": sum(1 for r in rows if r["stage"] not in ("invited",)),
            "logged_in": sum(1 for r in rows if STAGE_RANK[r["stage"]] >= STAGE_RANK["logged_in"]),
        },
        "where": "Team → Joining",
    }
