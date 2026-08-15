"""Meeting transcript → task-draft helpers.

Select only clearly identified action items, then best-guess an owner and
expected deadline from the transcript (and known teammates).
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Callable, List, Optional

MAX_TRANSCRIPT_TASKS = 10
LEGACY_SESSION_ID = "legacy"
ALL_SESSIONS_ID = "all"


def transcript_session_mongo_filter(session_id: Optional[str]) -> dict:
    """Match drafts for a session chip, including pre-session (legacy) rows."""
    sid = (session_id or "").strip()
    if not sid or sid == ALL_SESSIONS_ID:
        return {}
    if sid == LEGACY_SESSION_ID:
        return {
            "$or": [
                {"session_id": {"$exists": False}},
                {"session_id": None},
                {"session_id": ""},
                {"session_id": LEGACY_SESSION_ID},
            ]
        }
    return {"session_id": sid}


def draft_matches_session(draft: dict, session_id: Optional[str]) -> bool:
    """Client-equivalent of transcript_session_mongo_filter for a single draft."""
    sid = (session_id or "").strip()
    if not sid or sid == ALL_SESSIONS_ID:
        return True
    raw = draft.get("session_id") if isinstance(draft, dict) else None
    if sid == LEGACY_SESSION_ID:
        return not raw
    return raw == sid

ACTION_CUE = re.compile(
    r"\b("
    r"i'?ll|i will|i can|i am going to|i'm going to|"
    r"will|going to|gonna|"
    r"can you|could you|please|"
    r"action items?|takeaways?|follow[- ]ups?|to-?dos?|"
    r"need(?:s)? to|has to|have to|"
    r"to (?:send|schedule|review|draft|email|call|update|prepare|share|"
    r"finish|complete|fix|submit|write|follow up|follow-up)"
    r")\b",
    re.I,
)

SKIP_CUE = re.compile(
    r"\b("
    r"we (?:discussed|talked|covered|went over)|"
    r"just an update|status update|for your information|\bfyi\b|"
    r"parking lot|agenda|introductions?|"
    r"good point|sounds good|makes sense|"
    r"maybe we should think|in general|"
    r"no action|not an action"
    r")\b",
    re.I,
)

SPEAKER_LINE = re.compile(
    r"^\s*(?:[-*•]\s*)?(?:(?P<num>\d+)[\.)]\s*)?(?P<speaker>[A-Z][A-Za-z .'-]{1,40})\s*[:\-]\s*(?P<body>.+)$"
)

BULLET_LINE = re.compile(r"^\s*(?:[-*•]\s*|(?P<num>\d+)[\.)]\s+)(?P<body>.+)$")

NAME_WILL = re.compile(
    r"\b(?P<name>[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+"
    r"(?:will|is going to|needs to|to)\s+"
    r"(?:send|schedule|review|draft|email|call|update|prepare|share|finish|"
    r"complete|fix|submit|write|follow|own|take|handle|ping|book|close|chase|"
    r"create|check|get|make|do|put|run|lead|drive|ship|reach|align|confirm|"
    r"assign|nudge|publish)"
)

FIRST_PERSON = re.compile(r"\b(i'?ll|i will|i can|i am going to|i'm going to|let me)\b", re.I)

DATE_CUE = re.compile(
    r"\b(today|tomorrow|tonight|eod|asap|next week|this week|"
    r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"in \d+ (?:hours?|days?|weeks?)|by \d{1,2})\b",
    re.I,
)

EXPLICIT_ASK = re.compile(
    r"\b(can you|could you|please|action items?|takeaways?|follow[- ]ups?|to-?dos?)\b",
    re.I,
)

VERB_LED = re.compile(
    r"^(send|schedule|review|draft|email|call|update|prepare|share|finish|complete|"
    r"fix|submit|write|follow up|follow-up|create|ping|nudge|ship|publish|confirm|"
    r"book|reach out|assign|own|close|chase)",
    re.I,
)

GENERIC_TITLES = {
    "untitled", "task", "follow up", "follow-up", "action item", "todo", "to do",
    "discussion", "update", "notes", "agenda", "introductions", "parking lot",
}


def next_business_day_17(now: datetime) -> str:
    """Default expected deadline when the transcript has no date cue."""
    days = 1
    target = now + timedelta(days=days)
    while target.weekday() >= 5:  # Sat/Sun
        target += timedelta(days=1)
    return target.replace(hour=17, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")


def format_roster_block(roster: List[dict], importer: dict) -> str:
    lines = []
    for u in roster[:80]:
        name = (u.get("name") or "").strip()
        email = (u.get("email") or "").strip()
        if name or email:
            lines.append(f"- {name} <{email}>".strip())
    importer_name = (importer.get("name") or "the importer").strip()
    importer_email = (importer.get("email") or "").strip()
    block = "\n".join(lines) if lines else "(no teammates on file)"
    return (
        f"IMPORTER (use when the speaker says I/me, or no owner is named): "
        f"{importer_name} <{importer_email}>\n"
        f"KNOWN TEAMMATES (match owners to these people when the name appears):\n{block}"
    )


def build_transcript_extract_prompt(text: str, roster: List[dict], importer: dict, now: datetime) -> str:
    today = now.strftime("%A %Y-%m-%d")
    roster_block = format_roster_block(roster, importer)
    return (
        "You are Jarvis. Convert a meeting transcript into task drafts.\n"
        "QUALITY OVER QUANTITY. Extract only the most logical, clearly identified action items — "
        "commitments, explicit asks, and named next steps. "
        "Do NOT invent a task for every topic, idea, question, status update, FYI, recap, "
        "brainstorm, or parking-lot note. If the meeting had two real commitments, return two tasks.\n"
        f"Return at most {MAX_TRANSCRIPT_TASKS} tasks. Prefer 1–6. Empty tasks[] is allowed if nothing is a real action.\n"
        "For EVERY task you do return, always make a best guess for owner AND expected deadline "
        "from the transcript (never leave them blank):\n"
        "- assignee_hint: the person who volunteered, was asked, or is the logical owner. "
        "Match a KNOWN TEAMMATE name when possible. If the speaker said I/I'll, use that speaker "
        "if labeled, otherwise the IMPORTER. If still unclear, use the IMPORTER.\n"
        "- due_date_hint: the deadline as spoken (or null).\n"
        "- due_date: ISO YYYY-MM-DDTHH:MM in America/Los_Angeles. Convert relative dates using TODAY. "
        "If a date is spoken without a time, use 17:00. If no deadline is spoken, guess the next business day at 17:00.\n"
        "- owner_source: \"spoken\" if the owner was named/volunteered, else \"guessed\".\n"
        "- due_source: \"spoken\" if a date/time was stated, else \"guessed\".\n"
        "- is_clear_action: true only if this is a real commitment/ask (required).\n"
        "Other fields: title (short, verb-led), description (one paragraph), "
        "priority (Urgent/High/Medium/Low), importance (1-10), ambiguities (clarifying questions, may be empty).\n"
        "Reply ONLY with {\"tasks\": [ ... ]}. No prose.\n\n"
        f"TODAY (America/Los_Angeles): {today}\n"
        f"{roster_block}\n\n"
        "TRANSCRIPT:\n" + text
    )


def _looks_like_question_only(text: str) -> bool:
    t = (text or "").strip()
    if not t.endswith("?"):
        return False
    return not ACTION_CUE.search(t)


def _title_is_generic(title: str) -> bool:
    t = re.sub(r"[^a-z0-9 ]+", "", (title or "").lower()).strip()
    return (not t) or t in GENERIC_TITLES or len(t) < 6


def is_clear_action_text(text: str) -> bool:
    """True when a line/snippet is a concrete commitment or ask, not discussion."""
    t = (text or "").strip()
    if len(t) < 8:
        return False
    if _looks_like_question_only(t):
        return False
    has_action = bool(
        NAME_WILL.search(t)
        or FIRST_PERSON.search(t)
        or EXPLICIT_ASK.search(t)
        or VERB_LED.search(t)
        or (ACTION_CUE.search(t) and DATE_CUE.search(t))
    )
    if SKIP_CUE.search(t) and not has_action:
        return False
    return has_action


def filter_clear_identified_tasks(tasks: List[dict]) -> List[dict]:
    """Keep only clearly identified action items; cap volume."""
    if not isinstance(tasks, list):
        return []
    kept = []
    seen = set()
    for raw in tasks:
        if not isinstance(raw, dict):
            continue
        title = (raw.get("title") or "").strip()
        desc = (raw.get("description") or "").strip()
        blob = f"{title} {desc}".strip()
        if _title_is_generic(title):
            continue
        flag = raw.get("is_clear_action")
        if flag is False:
            continue
        if flag is not True and not is_clear_action_text(blob):
            continue
        key = re.sub(r"\s+", " ", title.lower())
        if key in seen:
            continue
        seen.add(key)
        kept.append(raw)
        if len(kept) >= MAX_TRANSCRIPT_TASKS:
            break
    # Prefer higher importance when we somehow still have too many
    kept.sort(key=lambda d: int(d.get("importance") or 5), reverse=True)
    return kept[:MAX_TRANSCRIPT_TASKS]


def _roster_name_hits(text: str, roster: List[dict]) -> List[dict]:
    if not text or not roster:
        return []
    low = text.lower()
    hits = []
    for u in roster:
        name = (u.get("name") or "").strip()
        if not name:
            continue
        parts = name.split()
        first = parts[0]
        # Prefer full-name, then distinct first name (len>2 to avoid "Al")
        if name.lower() in low:
            hits.append(u)
        elif len(first) > 2 and re.search(rf"\b{re.escape(first)}\b", text, re.I):
            hits.append(u)
    # Unique by id, preserve order
    seen = set()
    out = []
    for u in hits:
        uid = u.get("id") or u.get("email")
        if uid in seen:
            continue
        seen.add(uid)
        out.append(u)
    return out


def guess_owner_hint(text: str, roster: List[dict], importer: dict, speaker: Optional[str] = None) -> str:
    """Best-guess owner name from a task snippet + optional speaker label."""
    t = text or ""
    if speaker and FIRST_PERSON.search(t):
        hits = _roster_name_hits(speaker, roster)
        if hits:
            return hits[0].get("name") or speaker.strip()
        if speaker.strip():
            return speaker.strip()

    # Explicit "Alice will ..."
    m = NAME_WILL.search(t)
    if m:
        named = m.group("name")
        hits = _roster_name_hits(named, roster)
        if hits:
            return hits[0].get("name")
        return named

    # "I'll ping Alice" belongs to the speaker/importer, not Alice
    if FIRST_PERSON.search(t):
        return (importer.get("name") or "me")

    hits = _roster_name_hits(t, roster)
    if hits:
        return hits[0].get("name")

    return (importer.get("name") or "me")


def guess_due_iso(
    text: str,
    now: datetime,
    parse_date: Optional[Callable[[str, datetime], Optional[str]]] = None,
) -> Optional[str]:
    if not text:
        return None
    if parse_date:
        return parse_date(text, now)
    return None


def _clean_title(body: str) -> str:
    t = re.sub(r"\s+", " ", (body or "").strip())
    t = re.sub(r"^(action items?|takeaways?|follow[- ]ups?|to-?dos?)\s*[:\-]\s*", "", t, flags=re.I)
    return t[:120]


def fallback_extract_action_items(
    text: str,
    now: datetime,
    roster: List[dict],
    importer: dict,
    parse_date: Optional[Callable[[str, datetime], Optional[str]]] = None,
) -> List[dict]:
    """Regex fallback when the LLM is unavailable: only clear action lines."""
    if not text:
        return []
    drafts: List[dict] = []
    seen = set()

    def add(body: str, speaker: Optional[str]):
        body = (body or "").strip()
        if not is_clear_action_text(body):
            return
        title = _clean_title(body)
        if _title_is_generic(title):
            return
        key = title.lower()
        if key in seen:
            return
        seen.add(key)
        hint = guess_owner_hint(body, roster, importer, speaker=speaker)
        due_hint = None
        due_iso = guess_due_iso(body, now, parse_date)
        # Capture a short spoken hint if we parsed a date
        m = re.search(
            r"\b(today|tomorrow|tonight|eod|asap|next week|this week|"
            r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
            r"in \d+ (?:hours?|days?|weeks?))\b",
            body,
            re.I,
        )
        if m:
            due_hint = m.group(0)
        spoken_owner = bool(speaker) or bool(NAME_WILL.search(body)) or bool(_roster_name_hits(body, roster))
        drafts.append({
            "title": title[:200],
            "description": body[:2000],
            "assignee_hint": hint,
            "due_date_hint": due_hint,
            "due_date": due_iso,
            "priority": "High" if re.search(r"\b(urgent|asap|immediately)\b", body, re.I) else "Medium",
            "importance": 7 if spoken_owner else 5,
            "ambiguities": [],
            "is_clear_action": True,
            "owner_source": "spoken" if spoken_owner or FIRST_PERSON.search(body) else "guessed",
            "due_source": "spoken" if due_iso or due_hint else "guessed",
        })

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        sm = SPEAKER_LINE.match(line)
        if sm:
            add(sm.group("body"), sm.group("speaker"))
            if len(drafts) >= MAX_TRANSCRIPT_TASKS:
                return drafts
            continue
        bm = BULLET_LINE.match(line)
        if bm:
            add(bm.group("body"), None)
            if len(drafts) >= MAX_TRANSCRIPT_TASKS:
                return drafts
            continue
        # Bare sentence that is clearly an action
        if is_clear_action_text(line) and (
            NAME_WILL.search(line) or FIRST_PERSON.search(line) or VERB_LED.search(line)
        ):
            add(line, None)
            if len(drafts) >= MAX_TRANSCRIPT_TASKS:
                return drafts

    return drafts[:MAX_TRANSCRIPT_TASKS]


def apply_owner_and_due_guesses(
    task: dict,
    *,
    transcript: str,  # noqa: ARG001 — kept for call-site context / future quote matching
    roster: List[dict],
    importer: dict,
    now: datetime,
    parse_date: Callable[[str, datetime], Optional[str]],
) -> dict:
    """Fill missing owner/deadline with the best transcript-based guess."""
    d = dict(task)
    title = (d.get("title") or "").strip()
    desc = (d.get("description") or "").strip()
    snippet = f"{title}. {desc}".strip()

    hint = (d.get("assignee_hint") or "").strip() or None
    if not hint:
        hint = guess_owner_hint(snippet, roster, importer)
        d["owner_source"] = d.get("owner_source") or "guessed"
    d["assignee_hint"] = hint

    due_iso = d.get("due_date")
    if due_iso and not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", str(due_iso)):
        due_iso = None
    if not due_iso:
        due_iso = parse_date(f"{d.get('due_date_hint') or ''} {snippet}".strip(), now)
        if due_iso:
            d["due_source"] = d.get("due_source") or "spoken"
    if not due_iso:
        due_iso = next_business_day_17(now)
        d["due_source"] = "guessed"
    d["due_date"] = due_iso
    if not d.get("due_source"):
        d["due_source"] = "spoken" if d.get("due_date_hint") else "guessed"
    if not d.get("owner_source"):
        d["owner_source"] = "spoken"
    return d
