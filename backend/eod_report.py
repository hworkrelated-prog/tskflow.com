"""Compact end-of-day email: glance, who finished, who didn't, leaderboards."""
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

# Python weekday(): Monday=0 … Sunday=6
EOD_DAY_MON, EOD_DAY_SAT, EOD_DAY_SUN = 0, 5, 6
ALL_EOD_DAYS = [0, 1, 2, 3, 4, 5, 6]
# If the user clears every chip, snap back to weekends.
DEFAULT_WEEKEND_DAYS = [EOD_DAY_SAT, EOD_DAY_SUN]


def normalize_eod_days(raw: Any) -> List[int]:
    """Missing field → every day (weekends stay on). Empty list → Sat + Sun."""
    if raw is None:
        return list(ALL_EOD_DAYS)
    days: List[int] = []
    seq: Iterable = raw if isinstance(raw, (list, tuple, set)) else []
    for item in seq:
        try:
            n = int(item)
        except (TypeError, ValueError):
            continue
        if 0 <= n <= 6 and n not in days:
            days.append(n)
    return sorted(days) if days else list(DEFAULT_WEEKEND_DAYS)


def eod_sends_on_weekday(prefs: dict, weekday: int) -> bool:
    return int(weekday) in set(normalize_eod_days((prefs or {}).get("eod_days")))


def format_hours(hours: Optional[float]) -> str:
    if hours is None:
        return "—"
    if hours < 1:
        mins = max(1, int(round(hours * 60)))
        return f"{mins}m"
    if hours < 10:
        return f"{hours:.1f}h".replace(".0h", "h")
    return f"{int(round(hours))}h"


def simple_completion_hours(task: dict) -> Optional[float]:
    try:
        completed_at = task.get("completed_at")
        started_at = task.get("accepted_at") or task.get("created_at")
        if not completed_at or not started_at:
            return None
        end = datetime.fromisoformat(str(completed_at).replace("Z", "+00:00"))
        start = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
        secs = (end - start).total_seconds()
        if secs < 0:
            return None
        return round(secs / 3600, 2)
    except Exception:
        return None


def _who(task: dict, name_map: dict) -> str:
    aid = task.get("assigned_to") or ""
    name = name_map.get(aid)
    if name:
        return str(name).split(" ")[0]
    if str(aid).startswith("email_"):
        email = task.get("assigned_to_email") or aid[6:]
        return (email.split("@")[0] or "Someone").title()
    return (task.get("assigned_to_email") or "Someone").split("@")[0].title() or "Someone"


def aggregate_leaderboard(
    completed_tasks: Sequence[dict],
    name_map: dict,
    limit: int = 3,
) -> Tuple[List[dict], List[dict]]:
    """Same two rankings as Analytics: most completed, then fastest avg time."""
    by_user: Dict[str, dict] = {}
    for t in completed_tasks:
        uid = t.get("assigned_to") or ""
        if not uid:
            continue
        entry = by_user.setdefault(uid, {"name": _who(t, name_map), "completed": 0, "sum_hrs": 0.0, "n_hrs": 0})
        entry["completed"] += 1
        hrs = simple_completion_hours(t)
        if hrs is not None:
            entry["sum_hrs"] += hrs
            entry["n_hrs"] += 1
    rows = []
    for uid, e in by_user.items():
        avg = round(e["sum_hrs"] / e["n_hrs"], 2) if e["n_hrs"] else None
        rows.append({"user_id": uid, "name": e["name"], "completed": e["completed"], "avg_hours": avg})
    most = sorted(rows, key=lambda r: (-r["completed"], r["avg_hours"] if r["avg_hours"] is not None else 1e9))[:limit]
    fastest = sorted(
        [r for r in rows if r["avg_hours"] is not None],
        key=lambda r: (r["avg_hours"], -r["completed"]),
    )[:limit]
    return most, fastest


def group_unfinished(open_tasks: Sequence[dict], name_map: dict, now, limit: int = 5) -> List[dict]:
    """Who still has work out — overdue first, then not accepted, then open."""
    buckets: Dict[str, dict] = {}
    for t in open_tasks:
        if t.get("is_parent"):
            continue
        who = _who(t, name_map)
        overdue = False
        try:
            due = datetime.fromisoformat(str(t.get("due_date") or "").replace("Z", "+00:00"))
            now_cmp = now if due.tzinfo else now.replace(tzinfo=None)
            due_cmp = due if now_cmp.tzinfo else due.replace(tzinfo=None)
            overdue = due_cmp < now_cmp
        except Exception:
            pass
        status = (t.get("status") or "Pending")
        if overdue:
            why = "overdue"
            rank = 0
        elif status == "Pending":
            why = "hasn't accepted"
            rank = 1
        else:
            why = "still open"
            rank = 2
        b = buckets.setdefault(who, {"who": who, "why": why, "rank": rank, "titles": []})
        if rank < b["rank"]:
            b["rank"] = rank
            b["why"] = why
        title = (t.get("title") or "Untitled").strip()[:60]
        if title and title not in b["titles"] and len(b["titles"]) < 2:
            b["titles"].append(title)
    ordered = sorted(buckets.values(), key=lambda x: (x["rank"], x["who"]))
    return ordered[:limit]


def _esc(s: str) -> str:
    return (
        str(s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def eod_lead(payload: dict) -> Tuple[str, str]:
    """The first line of the digest is the news, not a greeting."""
    stuck = payload.get("stuck_items") or []
    if stuck:
        item = stuck[0]
        who = str(item.get("who") or "Someone").strip() or "Someone"
        why = str(item.get("why") or "still open").strip()
        titles = item.get("titles") or []
        title = str(titles[0]).strip() if titles else ""
        if why == "overdue":
            head = f"{who} is overdue"
        elif why == "hasn't accepted":
            head = f"{who} hasn't accepted"
        else:
            head = f"{who} still has open work"
        return head, title
    done_n = int(payload.get("done_count") or 0)
    open_n = int(payload.get("open_count") or 0)
    overdue_n = int(payload.get("overdue_count") or 0)
    if done_n and not open_n and not overdue_n:
        return "Everyone wrapped what was due.", ""
    if not done_n and not open_n:
        return "Quiet day — nothing on the board.", ""
    first = payload.get("first") or "there"
    return f"Your day, {first}", ""


def render_eod_inner(payload: dict) -> str:
    day = _esc(payload.get("day") or "")
    done_n = int(payload.get("done_count") or 0)
    open_n = int(payload.get("open_count") or 0)
    overdue_n = int(payload.get("overdue_count") or 0)
    glance = f"{done_n} done · {open_n} open"
    if overdue_n:
        glance += f" · {overdue_n} overdue"
    head, lead_title = eod_lead(payload)

    parts = [
        f'<h1 style="margin:0 0 6px;font-size:22px;color:#111827;font-weight:700;">{_esc(head)}</h1>',
    ]
    if lead_title:
        parts.append(
            f'<p style="margin:0 0 12px;font-size:15px;color:#374151;">{_esc(lead_title)}</p>'
        )
    if day:
        parts.append(f'<p style="margin:0 0 4px;color:#6b7280;font-size:13px;">{day}</p>')
    parts.append(
        f'<p style="margin:0 0 22px;font-size:14px;color:#6b7280;">{_esc(glance)}</p>'
    )

    done_items = payload.get("done_items") or []
    if done_items:
        rows = []
        for item in done_items[:5]:
            who = f'<span style="color:#6b7280;"> · {_esc(item.get("who"))}</span>' if item.get("who") else ""
            rows.append(
                f'<tr><td style="padding:4px 0;font-size:14px;color:#111827;">{_esc(item.get("title"))}{who}</td></tr>'
            )
        rows = "".join(rows)
        parts.append('<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;">Done</p>')
        parts.append(f'<table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">{rows}</table>')

    stuck = payload.get("stuck_items") or []
    if stuck:
        rows = []
        for item in stuck[:5]:
            titles = ", ".join(item.get("titles") or []) or "open work"
            rows.append(
                f'<tr><td style="padding:4px 0;font-size:14px;color:#111827;">'
                f'<strong>{_esc(item.get("who"))}</strong> — {_esc(item.get("why"))}'
                f'<div style="color:#6b7280;font-size:13px;">{_esc(titles)}</div>'
                f"</td></tr>"
            )
        parts.append('<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;">Didn\'t finish</p>')
        parts.append(f'<table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">{"".join(rows)}</table>')

    most = payload.get("most_done") or []
    fastest = payload.get("fastest") or []
    if most or fastest:
        label = _esc(payload.get("board_label") or "Today")
        def _col(title: str, lines: List[str]) -> str:
            body = "".join(f'<div style="padding:3px 0;font-size:14px;color:#111827;">{line}</div>' for line in lines) or '<div style="color:#9ca3af;font-size:13px;">—</div>'
            return (
                f'<td width="50%" valign="top" style="padding-right:12px;">'
                f'<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;">{_esc(title)}</p>'
                f"{body}</td>"
            )
        most_lines = [
            f"{i}. {_esc(r.get('name'))} — {int(r.get('completed') or 0)}"
            for i, r in enumerate(most, 1)
        ]
        fast_lines = [
            f"{i}. {_esc(r.get('name'))} — {format_hours(r.get('avg_hours'))}"
            for i, r in enumerate(fastest, 1)
        ]
        parts.append(
            f'<p style="margin:8px 0 10px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;">Leaderboard · {label}</p>'
        )
        parts.append(
            f'<table width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;"><tr>'
            f'{_col("Most done", most_lines)}{_col("Fastest", fast_lines)}'
            f"</tr></table>"
        )
        parts.append('<p style="margin:0;font-size:12px;color:#9ca3af;">Same ranking as Analytics.</p>')

    return "".join(parts)


def render_eod_slack(payload: dict) -> str:
    day = payload.get("day") or ""
    done_n = int(payload.get("done_count") or 0)
    open_n = int(payload.get("open_count") or 0)
    overdue_n = int(payload.get("overdue_count") or 0)
    glance = f"{done_n} done · {open_n} open"
    if overdue_n:
        glance += f" · {overdue_n} overdue"
    head, lead_title = eod_lead(payload)
    lead = f"*{head}*"
    if lead_title:
        lead += f" — {lead_title}"
    if day:
        lead += f" · {day}"
    lines = [lead, glance]
    stuck = payload.get("stuck_items") or []
    if stuck:
        bits = [f"{s.get('who')} ({s.get('why')})" for s in stuck[:4]]
        lines.append("Didn't finish: " + ", ".join(bits))
    most = payload.get("most_done") or []
    fastest = payload.get("fastest") or []
    if most:
        lines.append("Most done: " + ", ".join(f"{r.get('name')} {r.get('completed')}" for r in most[:3]))
    if fastest:
        lines.append("Fastest: " + ", ".join(f"{r.get('name')} {format_hours(r.get('avg_hours'))}" for r in fastest[:3]))
    return "\n".join(lines)
