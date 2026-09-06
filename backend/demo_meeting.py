"""Guest meeting notes: pull a short list of assignable tasks. No account, no bot.

The landing CTA opens a notepad the visitor keeps open in the next meeting.
They type or paste what people said. We keep only clear, named commitments.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Optional

from transcript_helpers import (
    MAX_TRANSCRIPT_TASKS,
    fallback_extract_action_items,
    filter_clear_identified_tasks,
)

# Short on purpose — a visitor should skim this, not read a novel.
MAX_MEETING_TASKS = min(8, MAX_TRANSCRIPT_TASKS)
MAX_NOTES_CHARS = 20000
MIN_NOTES_CHARS = 8

# Same sales cast as the landing film. Clear "Name: I'll …" lines so the
# regex fallback always returns a short assignable list without an LLM.
SAMPLE_MEETING = """
Pipeline review.

Maya: I'll send the Q3 forecast by Friday.
Chris: Chris will update the Salesforce stage today.
Priya: I'll draft the Acme proposal by tomorrow.
Alex: I'll schedule the kickoff next week.

We discussed the office plants. No action there.
"""

_DEMO_IMPORTER = {"id": "demo", "name": "You", "email": "you@tskflow.guest"}
_ISO_DUE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")


def meeting_notes_text(transcript: Optional[str], use_sample: bool) -> str:
    if use_sample:
        return SAMPLE_MEETING.strip()
    return re.sub(r"\s+\n", "\n", str(transcript or "")).strip()


def extract_meeting_tasks(
    text: str,
    now: datetime,
    parse_date=None,
) -> List[dict]:
    """Keep only clearly named commitments. Cap so the list stays short."""
    raw = fallback_extract_action_items(
        text,
        now,
        roster=[],
        importer=_DEMO_IMPORTER,
        parse_date=parse_date,
    )
    kept = filter_clear_identified_tasks(raw)
    return kept[:MAX_MEETING_TASKS]


def drafts_for_client(raw: List[dict]) -> List[dict]:
    out = []
    for index, row in enumerate(raw):
        title = (row.get("title") or "").strip()
        if not title:
            continue
        name = (row.get("assignee_hint") or "").strip()
        if name.lower() in {"you", "me"}:
            name = ""
        out.append({
            "id": f"m{index + 1}",
            "title": title[:200],
            "description": (row.get("description") or "").strip()[:2000],
            "assignee_name": name[:80],
            "due_hint": (row.get("due_date_hint") or "").strip()[:40],
            "due_date": (row.get("due_date") or "").strip()[:16],
        })
    return out


def due_date_for_send(raw: Optional[str], fallback: str) -> str:
    stamp = str(raw or "").strip()
    if _ISO_DUE.match(stamp):
        return stamp[:16]
    return fallback


def sendable_tasks(items: List[dict], *, is_valid_email) -> List[dict]:
    """Drop empty titles and invalid emails. Preserve spoken names."""
    out = []
    for raw in items or []:
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or "").strip()
        email = str(raw.get("assignee_email") or "").strip()
        if not title or not is_valid_email(email):
            continue
        name = str(raw.get("assignee_name") or "").strip()
        out.append({
            "title": title[:200],
            "description": str(raw.get("description") or "").strip()[:2000] or None,
            "assignee_email": email,
            "assignee_name": name[:80],
            "due_date": str(raw.get("due_date") or "").strip()[:16],
        })
        if len(out) >= MAX_MEETING_TASKS:
            break
    return out
