"""Roll up every assignee's reply on a group task into one assigner briefing."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

SUBMITTED = {"Review Pending", "Completed"}
IN_FLIGHT = {"Accepted", "In Progress"}
BLOCKED_LIKE = {"Blocked", "Declined", "Counter-Proposed"}


def excerpt(text: Optional[str], limit: int = 280) -> str:
    raw = re.sub(r"\s+", " ", (text or "").strip())
    if len(raw) <= limit:
        return raw
    return raw[: limit - 1].rstrip() + "…"


def collect_assignee_responses(children: List[dict]) -> List[dict]:
    rows: List[dict] = []
    for child in children or []:
        comments = child.get("comments") or []
        last_comments = []
        for cm in comments[-3:]:
            body = excerpt(cm.get("content") or "", 180)
            if not body:
                continue
            last_comments.append({
                "from": cm.get("user_name") or "Someone",
                "text": body,
            })
        note = (child.get("completion_note") or "").strip()
        status = child.get("status") or "Pending"
        rows.append({
            "id": child.get("id"),
            "name": child.get("assigned_to_name") or child.get("assigned_to_email") or "Someone",
            "status": status,
            "note": excerpt(note, 400),
            "has_note": bool(note),
            "has_images": bool(child.get("completion_note_images") or child.get("attachments")),
            "blocked_reason": excerpt(child.get("blocked_reason") or "", 200),
            "decline_reason": excerpt(child.get("reason_for_decline") or "", 200),
            "counter": excerpt(child.get("counter_proposal_message") or "", 200),
            "comments": last_comments,
            "has_reply": bool(
                note
                or last_comments
                or child.get("blocked_reason")
                or child.get("reason_for_decline")
                or child.get("counter_proposal_message")
            ),
        })
    return rows


def _names(rows: List[dict]) -> List[str]:
    return [r["name"] for r in rows]


def fallback_group_review(parent: dict, rows: List[dict]) -> Dict[str, Any]:
    """Deterministic briefing when the LLM is unavailable."""
    criteria = (parent.get("success_criteria") or "").strip()
    total = len(rows)
    silent = [r for r in rows if r["status"] == "Pending" and not r["has_reply"]]
    submitted = [r for r in rows if r["status"] in SUBMITTED]
    in_flight = [r for r in rows if r["status"] in IN_FLIGHT]
    blocked = [r for r in rows if r["status"] in BLOCKED_LIKE]
    with_notes = [r for r in submitted if r["has_note"] or r["comments"]]
    empty_submit = [r for r in submitted if not r["has_note"] and not r["comments"]]

    headline = f"{len(submitted)} of {total} people have submitted."
    if silent:
        headline += f" {len(silent)} have not replied."
    if blocked:
        headline += f" {len(blocked)} are blocked or declined."

    themes: List[str] = []
    if with_notes:
        themes.append(f"{len(with_notes)} submitted a written update.")
    if empty_submit:
        themes.append(f"{len(empty_submit)} marked done without a note.")
    if in_flight:
        themes.append(f"{len(in_flight)} accepted and are still working.")
    if not criteria:
        themes.append("No written expectation was set, so this is a summary of what people said — not a grade.")

    needs = []
    for r in empty_submit + blocked:
        why = r["blocked_reason"] or r["decline_reason"] or r["counter"] or "Submitted without a written update."
        needs.append({"name": r["name"], "why": why})
    for r in silent[:8]:
        needs.append({"name": r["name"], "why": "No reply yet."})

    read_first = []
    for r in (empty_submit + blocked + with_notes)[:5]:
        snippet = r["note"] or r["blocked_reason"] or r["decline_reason"] or "Open their task to read the thread."
        read_first.append({"name": r["name"], "reason": snippet})

    if criteria:
        suggested = (
            "Read the people under Needs attention against your expectation: "
            + excerpt(criteria, 160)
        )
    else:
        suggested = "Skim the themes, then open anyone flagged below. Add a 'done well looks like' line next time so the assistant can check fit."

    plain_bits = [headline]
    if with_notes:
        samples = "; ".join(f"{r['name']}: {r['note']}" for r in with_notes[:6] if r["note"])
        if samples:
            plain_bits.append("What people said — " + samples)
    if silent:
        plain_bits.append("No reply yet — " + ", ".join(_names(silent)[:12]))

    return {
        "headline": headline,
        "has_expectations": bool(criteria),
        "counts": {
            "total": total,
            "silent": len(silent),
            "in_progress": len(in_flight),
            "submitted": len(submitted),
            "looks_aligned": 0 if criteria else None,
            "needs_attention": len(needs),
            "blocked_or_declined": len(blocked),
        },
        "themes": themes,
        "aligned": [],
        "needs_attention": needs[:12],
        "silent": _names(silent),
        "read_first": read_first,
        "suggested_nudge": suggested,
        "plain_summary": " ".join(plain_bits),
        "source": "fallback",
    }


def _parse_llm_json(raw: str) -> Optional[dict]:
    text = (raw or "").strip()
    if not text:
        return None
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I | re.S).strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _merge_llm(fallback: dict, llm: dict) -> dict:
    out = dict(fallback)
    out["source"] = "llm"
    for key in (
        "headline",
        "themes",
        "aligned",
        "needs_attention",
        "read_first",
        "suggested_nudge",
        "plain_summary",
    ):
        if llm.get(key):
            out[key] = llm[key]
    if isinstance(llm.get("counts"), dict):
        counts = dict(out["counts"])
        counts.update({k: v for k, v in llm["counts"].items() if v is not None})
        out["counts"] = counts
    if "has_expectations" in llm:
        out["has_expectations"] = bool(llm["has_expectations"])
    if isinstance(llm.get("silent"), list):
        out["silent"] = llm["silent"]
    return out


async def generate_group_response_review(parent: dict, children: List[dict]) -> Dict[str, Any]:
    rows = collect_assignee_responses(children)
    fallback = fallback_group_review(parent, rows)
    key = os.getenv("EMERGENT_LLM_KEY")
    if not key or not rows:
        return fallback

    criteria = (parent.get("success_criteria") or "").strip()
    payload = {
        "task": parent.get("title"),
        "description": excerpt(parent.get("description") or "", 400),
        "expectation": criteria or None,
        "people": rows[:40],
    }
    prompt = (
        "You are the assigner's assistant. They cannot read every individual reply.\n"
        "Review every person's status and written response.\n"
        "If an expectation / 'done well looks like' is provided, check each written reply against it.\n"
        "If there is no expectation, do NOT invent one — summarize what people said and group similar answers.\n"
        "Never give a pass/fail grade. Be specific and use people's names.\n"
        "Return JSON only with keys: headline, has_expectations, counts "
        "(total, silent, in_progress, submitted, looks_aligned, needs_attention, blocked_or_declined), "
        "themes (string array), aligned ([{name, why}]), needs_attention ([{name, why}]), "
        "silent (string array), read_first ([{name, reason}]), suggested_nudge, plain_summary.\n"
        "looks_aligned should be null when there is no expectation.\n"
        "Keep headline to one sentence. Keep lists to the most useful 8 items.\n"
        f"DATA:\n{json.dumps(payload, ensure_ascii=True)}"
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=key,
            session_id=f"group_review_{parent.get('id')}",
            system_message="You brief managers on team task replies. JSON only. No pass/fail grades.",
        ).with_model("openai", "gpt-4o-mini")
        raw = await chat.send_message(UserMessage(text=prompt))
        parsed = _parse_llm_json(raw if isinstance(raw, str) else str(raw))
        if parsed:
            return _merge_llm(fallback, parsed)
    except Exception as e:
        logging.error(f"generate_group_response_review: {e}")
    return fallback
