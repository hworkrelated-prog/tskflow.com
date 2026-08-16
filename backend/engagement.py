"""Product engagement snapshot + Friday 3pm digest copy."""
from datetime import datetime
from typing import Any, Dict, List, Optional

FRIDAY = 4  # datetime.weekday(): Monday=0
SEND_HOUR_PST = 15  # 3 PM


def week_id(now: datetime) -> str:
    return now.strftime("%G-W%V")


def should_send_weekly(now: datetime) -> bool:
    """True on Friday during the 3 PM Pacific hour."""
    return now.weekday() == FRIDAY and now.hour == SEND_HOUR_PST


def engagement_blurb(snap: Dict[str, Any]) -> str:
    """One-line read on whether people are using the product."""
    total = int(snap.get("total_users") or 0)
    active = int(snap.get("active_week") or 0)
    assigned_week = int(snap.get("tasks_assigned_out_week") or 0)
    new_users = int(snap.get("new_users_week") or 0)
    if total == 0:
        return "No one has signed up yet."
    if active == 0 and assigned_week == 0 and new_users == 0:
        return "Quiet week — nobody logged in or assigned work."
    if active == 0 and new_users > 0:
        return f"{new_users} new signup{'s' if new_users != 1 else ''} this week, but none came back."
    share = round(100 * active / total) if total else 0
    if assigned_week == 0:
        return f"{active} of {total} people were active ({share}%), but no tasks were assigned out."
    return f"{active} of {total} people were active ({share}%), and {assigned_week} task{'s' if assigned_week != 1 else ''} went out."


def _row(label: str, value: Any) -> str:
    return (
        f'<tr><td style="padding:8px 0;border-bottom:1px solid #eef0f3;color:#4b5563;">{label}</td>'
        f'<td style="padding:8px 0;border-bottom:1px solid #eef0f3;text-align:right;font-weight:600;color:#111827;">{value}</td></tr>'
    )


def render_engagement_html(snap: Dict[str, Any], now: Optional[datetime] = None) -> str:
    """Short HTML body (inner) for the weekly owner email."""
    day = (now or datetime.now()).strftime("%A, %b %d, %Y")
    blurb = engagement_blurb(snap)
    domains: List[Dict[str, Any]] = snap.get("top_domains") or []
    domain_rows = "".join(
        f"<tr><td style='padding:4px 0;color:#6b7280;'>{d.get('domain') or 'unknown'}</td>"
        f"<td style='padding:4px 0;text-align:right;'>{d.get('users', 0)}</td></tr>"
        for d in domains[:8]
    ) or "<tr><td style='color:#9ca3af;'>No domains yet</td></tr>"

    return f"""
<h2 style="margin:0 0 6px;font-size:20px;">Tskflow this week</h2>
<p style="color:#6b7280;margin:0 0 16px;">{day}</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;">{blurb}</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
  {_row("Signed up (total)", snap.get("total_users", 0))}
  {_row("New this week", snap.get("new_users_week", 0))}
  {_row("Active in the last 7 days", snap.get("active_week", 0))}
  {_row("Logged in today", snap.get("active_today", 0))}
  {_row("Tasks assigned out (total)", snap.get("tasks_assigned_out", 0))}
  {_row("Assigned out this week", snap.get("tasks_assigned_out_week", 0))}
  {_row("Still open (assigned out)", snap.get("open_assigned_out", 0))}
  {_row("Completed this week", snap.get("completed_week", 0))}
  {_row("Self-assigned still open", snap.get("open_self", 0))}
  {_row("Overdue", snap.get("overdue", 0))}
  {_row("Signed up, never created a task", snap.get("never_created_a_task", 0))}
</table>
<h3 style="font-size:14px;margin:0 0 8px;color:#374151;">Where people are from</h3>
<table style="width:100%;border-collapse:collapse;">{domain_rows}</table>
"""


def digest_subject(now: datetime) -> str:
    return f"Tskflow weekly — {now.strftime('%b %d')}: {now.strftime('%G-W%V')}"
