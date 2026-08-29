"""Anonymous product funnel events + the daily analytics email for the owner.

Pure helpers: event validation, PII-safe meta, funnel math and email rendering.
Mongo reads/writes live in server.py.
"""
import hashlib
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

DAILY_SEND_HOUR_PST = 8  # 8:00 AM Pacific
EVENTS_COLLECTION = "product_events"
DIGEST_COLLECTION = "daily_analytics_digests"

# Client-reported funnel events plus the two the server fires itself.
KNOWN_EVENTS = (
    "landing_view",
    "landing_interact",
    "demo_launch",
    "demo_send",
    "recording_start",
    "login",
    "register",
    "google_signup",
    "env_view",
)

_SLUG_RE = re.compile(r"[^a-z0-9_]")


def day_id(now: datetime) -> str:
    return now.strftime("%Y-%m-%d")


def should_send_daily(now: datetime) -> bool:
    """True during the 8 AM Pacific hour. The once-per-day guard lives in Mongo."""
    return now.hour == DAILY_SEND_HOUR_PST


def normalize_event(raw: Any) -> Optional[str]:
    key = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    key = _SLUG_RE.sub("", key)
    return key if key in KNOWN_EVENTS else None


def hash_ip(ip: Optional[str], salt: str = "") -> Optional[str]:
    """One-way IP fingerprint for rate limits. Never store the raw address."""
    raw = str(ip or "").strip()
    if not raw or raw == "unknown":
        return None
    return hashlib.sha256(f"{salt}|{raw}".encode("utf-8")).hexdigest()[:32]


def clean_session_id(raw: Any) -> Optional[str]:
    sid = _SLUG_RE.sub("", str(raw or "").strip().lower())
    return sid[:48] or None


def clean_meta(raw: Any, max_keys: int = 10, max_len: int = 120) -> dict:
    """Keep small scalar hints only. Drops anything that looks like an address."""
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, Any] = {}
    for key, value in raw.items():
        if len(out) >= max_keys:
            break
        name = _SLUG_RE.sub("", str(key or "").strip().lower().replace("-", "_"))[:32]
        if not name:
            continue
        if isinstance(value, bool) or isinstance(value, int) or isinstance(value, float):
            out[name] = value
            continue
        text = str(value or "").strip()
        if not text:
            continue
        if "@" in text or text.count(".") >= 3:
            continue  # never keep raw email / IP-ish values
        out[name] = text[:max_len]
    return out


def event_doc(
    event: str,
    *,
    now: datetime,
    session_id: Optional[str] = None,
    ip_hash: Optional[str] = None,
    user_id: Optional[str] = None,
    meta: Optional[dict] = None,
    source: str = "client",
) -> dict:
    return {
        "event": event,
        "at": now.isoformat(),
        "date": day_id(now),
        "session_id": clean_session_id(session_id),
        "ip_hash": ip_hash,
        "user_id": user_id,
        "source": source,
        "meta": clean_meta(meta),
    }


def empty_day(date: str = "") -> dict:
    return {
        "date": date,
        "landing_views": 0,
        "interactions": 0,
        "demo_launches": 0,
        "demo_sends": 0,
        "recording_starts": 0,
        "logins": 0,
        "login_users": 0,
        "logins_email": 0,
        "logins_google": 0,
        "signups": 0,
        "google_signups": 0,
        "env_views": 0,
        "guest_sessions": 0,
        "tasks_created": 0,
        "tasks_completed": 0,
    }


def funnel_stages(day: Dict[str, Any]) -> List[Dict[str, Any]]:
    """land → interact → launch → login/signup, each with a share of the landing views."""
    views = int(day.get("landing_views") or 0)
    joined = int(day.get("signups") or 0) + int(day.get("google_signups") or 0)
    rows = [
        ("Landed", int(day.get("landing_views") or 0)),
        ("Interacted", int(day.get("interactions") or 0)),
        ("Launched a robot", int(day.get("demo_launches") or 0)),
        ("Logged in or signed up", int(day.get("logins") or 0) + joined),
    ]
    out = []
    for label, value in rows:
        share = round(100 * value / views) if views else 0
        out.append({"label": label, "value": value, "share": share})
    return out


def analytics_blurb(day: Dict[str, Any], prev: Optional[Dict[str, Any]] = None) -> str:
    """One line on whether the landing page turned visitors into robot rooms."""
    views = int(day.get("landing_views") or 0)
    interacts = int(day.get("interactions") or 0)
    launches = int(day.get("demo_launches") or 0)
    sends = int(day.get("demo_sends") or 0)
    joined = int(day.get("signups") or 0) + int(day.get("google_signups") or 0)
    if views == 0 and launches == 0 and joined == 0:
        return "No landing traffic today."
    if launches == 0 and interacts == 0:
        return f"{views} landed, nobody touched the composer."
    if launches == 0:
        return f"{views} landed and {interacts} touched the composer, but nobody sent an ask."
    tail = f" {sends} went out for real." if sends else ""
    joined_tail = f" {joined} kept an account." if joined else ""
    return f"{views} landed, {launches} launched a robot room.{tail}{joined_tail}"


def _row(label: str, today: Any, yesterday: Any) -> str:
    return (
        f'<tr><td style="padding:7px 0;border-bottom:1px solid #eef0f3;color:#4b5563;">{label}</td>'
        f'<td style="padding:7px 0;border-bottom:1px solid #eef0f3;text-align:right;font-weight:600;color:#111827;">{today}</td>'
        f'<td style="padding:7px 0;border-bottom:1px solid #eef0f3;text-align:right;color:#9ca3af;">{yesterday}</td></tr>'
    )


def render_daily_analytics_html(snap: Dict[str, Any], now: Optional[datetime] = None) -> str:
    """Inner HTML for the daily owner email: funnel first, then the product totals."""
    now = now or datetime.now()
    today = snap.get("today") or empty_day()
    prev = snap.get("prev") or empty_day()
    totals = snap.get("totals") or {}
    blurb = snap.get("blurb") or analytics_blurb(today, prev)

    funnel_rows = "".join(
        f'<tr><td style="padding:5px 0;color:#4b5563;">{s["label"]}</td>'
        f'<td style="padding:5px 0;text-align:right;font-weight:600;color:#111827;">{s["value"]}</td>'
        f'<td style="padding:5px 0;text-align:right;color:#9ca3af;">{s["share"]}%</td></tr>'
        for s in funnel_stages(today)
    )
    domains = totals.get("top_domains") or []
    domain_rows = "".join(
        f'<tr><td style="padding:4px 0;color:#6b7280;">{d.get("domain") or "unknown"}</td>'
        f'<td style="padding:4px 0;text-align:right;">{d.get("users", 0)}</td></tr>'
        for d in domains[:8]
    ) or '<tr><td style="color:#9ca3af;">No domains yet</td></tr>'

    return f"""
<h2 style="margin:0 0 6px;font-size:20px;">Tskflow today</h2>
<p style="color:#6b7280;margin:0 0 16px;">{now.strftime('%A, %b %d, %Y')} &middot; Pacific</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;">{blurb}</p>

<h3 style="font-size:14px;margin:0 0 8px;color:#374151;">Funnel today</h3>
<table style="width:100%;border-collapse:collapse;margin:0 0 22px;">{funnel_rows}</table>

<h3 style="font-size:14px;margin:0 0 8px;color:#374151;">Landing &amp; demo <span style="color:#9ca3af;font-weight:400;">(today / yesterday)</span></h3>
<table style="width:100%;border-collapse:collapse;margin:0 0 22px;">
  {_row("Unique landing views", today.get("landing_views", 0), prev.get("landing_views", 0))}
  {_row("Interactions (typed, sample, record)", today.get("interactions", 0), prev.get("interactions", 0))}
  {_row("Demo launches", today.get("demo_launches", 0), prev.get("demo_launches", 0))}
  {_row("Tasks sent from landing", today.get("demo_sends", 0), prev.get("demo_sends", 0))}
  {_row("Screen recordings started", today.get("recording_starts", 0), prev.get("recording_starts", 0))}
  {_row("Guest sessions created", today.get("guest_sessions", 0), prev.get("guest_sessions", 0))}
  {_row("Robot rooms opened", today.get("env_views", 0), prev.get("env_views", 0))}
</table>

<h3 style="font-size:14px;margin:0 0 8px;color:#374151;">Logins &amp; signups <span style="color:#9ca3af;font-weight:400;">(today / yesterday)</span></h3>
<table style="width:100%;border-collapse:collapse;margin:0 0 22px;">
  {_row("Logins", today.get("logins", 0), prev.get("logins", 0))}
  {_row("Unique people logging in", today.get("login_users", 0), prev.get("login_users", 0))}
  {_row("Logins with email", today.get("logins_email", 0), prev.get("logins_email", 0))}
  {_row("Logins with Google", today.get("logins_google", 0), prev.get("logins_google", 0))}
  {_row("New signups", today.get("signups", 0), prev.get("signups", 0))}
  {_row("New signups with Google", today.get("google_signups", 0), prev.get("google_signups", 0))}
</table>

<h3 style="font-size:14px;margin:0 0 8px;color:#374151;">Product totals</h3>
<table style="width:100%;border-collapse:collapse;margin:0 0 22px;">
  {_row("Total users", totals.get("total_users", 0), "")}
  {_row("Daily active users", totals.get("dau", 0), "")}
  {_row("Tasks created", today.get("tasks_created", 0), prev.get("tasks_created", 0))}
  {_row("Tasks completed", today.get("tasks_completed", 0), prev.get("tasks_completed", 0))}
  {_row("Signed up, never created a task", totals.get("never_created_a_task", 0), "")}
  {_row("First-session abandonment", f"{totals.get('abandonment_rate', 0)}%", "")}
</table>

<h3 style="font-size:14px;margin:0 0 8px;color:#374151;">Where people are from</h3>
<table style="width:100%;border-collapse:collapse;">{domain_rows}</table>
"""


def daily_subject(now: datetime) -> str:
    return f"Tskflow daily \u2014 {now.strftime('%b %d')}"


def snapshot_for_email(
    today: Dict[str, Any],
    prev: Dict[str, Any],
    totals: Dict[str, Any],
    now: Optional[datetime] = None,
) -> dict:
    now = now or datetime.now()
    snap = {
        "date": day_id(now),
        "generated_at": now.isoformat(),
        "today": today,
        "prev": prev,
        "totals": totals,
        "funnel": funnel_stages(today),
    }
    snap["blurb"] = analytics_blurb(today, prev)
    return snap
