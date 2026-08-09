"""Helpers for Blocked status, priority follow-ups, manager EOD, AI work review."""
import logging
import os
from datetime import datetime, timedelta
from typing import Optional, Tuple


def priority_followup_config(priority: str) -> dict:
    p = (priority or "Medium").strip()
    if p == "Urgent":
        return {"no_response_hours": 1, "no_progress_hours": 6, "gap_hours": 2, "quiet": False, "buckets": True}
    if p == "High":
        return {"no_response_hours": 2, "no_progress_hours": 12, "gap_hours": 4, "quiet": False, "buckets": True}
    if p == "Low":
        return {"no_response_hours": 24, "no_progress_hours": 48, "gap_hours": 24, "quiet": True, "buckets": False}
    return {"no_response_hours": 8, "no_progress_hours": 24, "gap_hours": 12, "quiet": True, "buckets": True}


async def generate_ai_work_review(task: dict, completion_note: Optional[str], has_images: bool) -> Optional[str]:
    emergent_key = os.getenv("EMERGENT_LLM_KEY")
    if not emergent_key:
        return None
    criteria = (task.get("success_criteria") or "").strip()
    note = (completion_note or task.get("completion_note") or "").strip()
    prompt = (
        "You help a manager review submitted work. Do NOT give a pass/fail verdict.\n"
        "Return a short plain-text checklist (3-6 bullets) covering: what looks covered, "
        "gaps vs expectations, and one open question for the manager.\n"
        f"Task: {task.get('title', '')}\n"
        f"Description: {(task.get('description') or '')[:400]}\n"
        f"Success criteria / done-well: {criteria or '(none stated)'}\n"
        f"Assignee completion note: {note or '(none)'}\n"
        f"Has screenshots/attachments: {'yes' if has_images else 'no'}\n"
        "Keep under 120 words. Use bullets starting with - "
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=emergent_key,
            session_id=f"review_{task.get('id')}",
            system_message="You write concise advisory work-review checklists for managers. No pass/fail grades.",
        ).with_model("openai", "gpt-4o-mini")
        raw = await chat.send_message(UserMessage(text=prompt))
        out = (raw if isinstance(raw, str) else str(raw)).strip()
        return out[:2000] if out else None
    except Exception as e:
        logging.error(f"generate_ai_work_review: {e}")
        return None


async def build_manager_eod_section(
    db,
    u: dict,
    now,
    PST,
    timedelta_cls=timedelta,
    include_snapshot: bool = True,
    include_plan: bool = True,
) -> Tuple[str, str, dict]:
    if not include_snapshot and not include_plan:
        return "", "", {}
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    created_today = await db.tasks.find({
        "created_by": u["id"],
        "created_at": {"$gte": today_start},
        "deleted": {"$ne": True},
        "is_parent": {"$ne": True},
        "status": {"$ne": "Draft"},
    }, {"_id": 0}).to_list(500)
    if not created_today:
        return "", "", {}

    accepted = [t for t in created_today if t.get("status") in ("Accepted", "Review Pending", "Completed", "Blocked") or t.get("accepted_at")]
    pending = [t for t in created_today if t.get("status") == "Pending"]
    completed = [t for t in created_today if t.get("status") == "Completed"]
    blocked = [t for t in created_today if t.get("status") == "Blocked"]

    ids = list({t.get("assigned_to") for t in created_today if t.get("assigned_to")})
    users = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(ids) or 1)
    name_map = {x["id"]: x.get("name") or "Someone" for x in users}

    def _who(t):
        aid = t.get("assigned_to")
        if not aid:
            return "Unassigned"
        if str(aid).startswith("email_"):
            return t.get("assigned_to_email") or aid[6:]
        return name_map.get(aid, t.get("assigned_to_email") or "Someone")

    accepted_names = sorted({_who(t) for t in accepted})
    pending_names = sorted({_who(t) for t in pending})

    week_start = (now - timedelta_cls(days=7)).isoformat()
    recent = await db.tasks.find({
        "created_by": u["id"],
        "created_at": {"$gte": week_start},
        "deleted": {"$ne": True},
        "is_parent": {"$ne": True},
        "status": {"$ne": "Draft"},
    }, {"_id": 0, "assigned_to": 1, "assigned_to_email": 1, "status": 1, "due_date": 1, "completed_at": 1}).to_list(2000)

    stats = {}
    for t in recent:
        key = _who(t)
        s = stats.setdefault(key, {"done": 0, "missed": 0, "pending_old": 0, "assigned": 0})
        s["assigned"] += 1
        if t.get("status") == "Completed":
            s["done"] += 1
        if t.get("status") == "Pending":
            s["pending_old"] += 1
        try:
            due = datetime.fromisoformat((t.get("due_date") or "").replace("Z", "+00:00"))
            if due.tzinfo is None:
                due = PST.localize(due)
            if due < now and t.get("status") not in ("Completed", "Declined"):
                s["missed"] += 1
        except Exception:
            pass

    top = sorted(stats.items(), key=lambda kv: (kv[1]["done"], -kv[1]["missed"]), reverse=True)
    top_names = [n for n, s in top if s["done"] > 0][:3]
    trouble = sorted(stats.items(), key=lambda kv: (kv[1]["missed"] + kv[1]["pending_old"], -kv[1]["done"]), reverse=True)
    trouble_names = [n for n, s in trouble if (s["missed"] + s["pending_old"]) > 0 and s["done"] < s["assigned"]][:3]

    plan_bits = []
    if pending_names:
        plan_bits.append(f"Follow up with {', '.join(pending_names[:5])} tomorrow morning on unaccepted tasks.")
    if blocked:
        plan_bits.append(f"Unblock {len(blocked)} blocked task(s) - talk to the assignee directly.")
    if trouble_names:
        plan_bits.append(f"Check in with {', '.join(trouble_names)} - deadlines or engagement slipping.")
    if not plan_bits:
        plan_bits.append("Team is engaging - keep momentum and spot-check in-progress work.")

    acc_list = ", ".join(accepted_names[:12]) or "-"
    pend_list = ", ".join(pending_names[:12]) or "-"
    top_list = ", ".join(top_names) or "-"
    trouble_list = ", ".join(trouble_names) or "-"
    plan_html = "".join([f"<li>{b}</li>" for b in plan_bits])

    html_parts = []
    slack_parts = []
    if include_snapshot:
        html_parts.append(f"""
    <h3 style="font-size:16px;margin:24px 0 8px;">Manager snapshot (tasks you assigned today)</h3>
    <ul style="padding-left:20px;margin:0;">
      <li><strong>{len(created_today)}</strong> assigned today</li>
      <li><strong>{len(accepted)}</strong> accepted - {acc_list}</li>
      <li><strong>{len(pending)}</strong> not accepted - {pend_list}</li>
      <li><strong>{len(completed)}</strong> completed from today's assigns</li>
      <li>Top performers (7d): {top_list}</li>
      <li>Needs attention (7d): {trouble_list}</li>
    </ul>
    """)
        slack_parts.append(
            f"*Manager snapshot*\n"
            f"Assigned today: {len(created_today)} | Accepted: {len(accepted)} | Not accepted: {len(pending)} | Completed: {len(completed)}\n"
            f"Top: {top_list}\nNeeds attention: {trouble_list}"
        )
    if include_plan:
        html_parts.append(f"""
    <h4 style="font-size:14px;margin:16px 0 6px;">Suggested plan</h4>
    <ul style="padding-left:20px;margin:0;">{plan_html}</ul>
    """)
        slack_parts.append("\n".join(f"- {b}" for b in plan_bits))
    html = "".join(html_parts)
    slack = "\n".join(slack_parts)
    counts = {
        "assigned_today": len(created_today),
        "accepted_today": len(accepted),
        "pending_today": len(pending),
        "completed_from_today": len(completed),
    }
    return html, slack, counts
