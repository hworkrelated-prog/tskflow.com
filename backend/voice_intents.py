"""Deterministic voice intents for Rook. Keep these offline-safe and spoken-short."""
from __future__ import annotations

import re
from typing import Optional

# Pages the assistant can open. Keep in sync with frontend/src/lib/voiceActions.js
VOICE_NAV_TARGETS = {
    "dashboard": "dashboard",
    "home": "dashboard",
    "hub": "dashboard",
    "analytics": "analytics",
    "metrics": "analytics",
    "reports": "analytics",
    "report": "analytics",
    "team": "team",
    "org chart": "team",
    "settings": "settings",
    "preferences": "settings",
    "help": "help",
    "recordings": "recordings",
    "recording": "recordings",
    "recurring": "recurring",
    "leads": "leads",
    "lead": "leads",
    "transcript": "transcript",
    "meeting notes": "transcript",
    "activity": "activity",
    "activity log": "activity",
    "unbiassly": "unbiassly",
    "calendar": "calendar",
    "connect calendar": "calendar",
    "leaderboard": "leaderboard",
    "updates": "updates",
    "what's new": "updates",
}

_HOWTO = [
    (
        re.compile(r"\b(assign|create|make)\b.*\b(task|ask|to-?do)\b|\bhow do i (assign|create)\b", re.I),
        "Type or say who, what, and when. I draft it, you hit Send. Or just tell me: ask Alice to send the recap by Friday.",
    ),
    (
        re.compile(r"\b(recurring|repeat|every day|weekly series)\b", re.I),
        "Say how often, like every weekday at 5. Or tap plus, then Recurring. You can edit one occurrence or the whole series later.",
    ),
    (
        re.compile(r"\b(voice|talk to you|microphone|chatgpt)\b", re.I),
        "Tap the mic and just talk. I listen, answer, and keep listening, like ChatGPT. Tap again when you're done. Ctrl Shift M works too.",
    ),
    (
        re.compile(r"\b(screen record|record(ing)? my screen|loom)\b", re.I),
        "Plus menu, Record screen. It attaches to the task. Receivers play it inline, no download. iPhone uses the mic instead.",
    ),
    (
        re.compile(r"\b(drafts?|unfinished)\b", re.I),
        "Drafts save as you type. Resume them from the yellow unfinished strip on the dashboard, or trash them there.",
    ),
    (
        re.compile(r"\b(analytics|leaderboard|completion rate)\b", re.I),
        "Analytics is overall stats, overdue, speed. The leaderboard ranks the team. Say open analytics and I'll take you.",
    ),
    (
        re.compile(r"\b(reminder|nudge|hound|follow.?up)\b", re.I),
        "Settings, Reminders. Quiet, Balanced, or Assertive. If someone goes quiet, Hound follows up twice, then keeps after them.",
    ),
    (
        re.compile(r"\bunbiassly\b", re.I),
        "Unbiassly is anonymous discussion. Create a shareable link. Anyone can write. You get the summary and trends, not the names.",
    ),
    (
        re.compile(r"\b(transcript|meeting notes|from transcript)\b", re.I),
        "Open Transcript, paste notes, and I'll pull out tasks. Say from transcript and I'll take you there.",
    ),
    (
        re.compile(r"\b(google )?calendar\b", re.I),
        "Connect Google Calendar in Settings. Accepted tasks can land on the calendar. I can open that page for you.",
    ),
    (
        re.compile(r"\b(google )?sheets?\b|\bdaily metrics\b|\b(ae|rep) (doing|numbers)\b", re.I),
        "Connect Google Sheets in Settings, map columns, then Sync. After that, ask me how an AE is doing today.",
    ),
    (
        re.compile(r"\bslack\b", re.I),
        "Connect Slack in Settings. I'll ping people there when you assign, and follow up if they go quiet.",
    ),
    (
        re.compile(r"\b(group task|several people|multiple people)\b", re.I),
        "Name more than one person and each gets their own copy, plus a group leaderboard. Same ask, separate accountability.",
    ),
    (
        re.compile(r"\b(accept|decline|counter.?propose|mark (it |this )?done|complete)\b", re.I),
        "Assignees accept, decline with a reason, or counter a date. Done goes to review. The creator approves, or it auto-completes in 24 hours.",
    ),
    (
        re.compile(r"\b(help center|docs|walkthrough)\b", re.I),
        "Help is docs, a walkthrough, and what's new. Say open help and I'll take you.",
    ),
    (
        re.compile(r"\b(attach|screenshot|file)\b", re.I),
        "Plus menu, Attach. You can paste a screenshot too. Recordings from the plus menu land on the same task.",
    ),
]


def _nav_target(low: str) -> Optional[str]:
    # Longer keys first so "activity log" wins over "activity".
    for key, target in sorted(VOICE_NAV_TARGETS.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(key)}\b", low):
            return target
    return None


def match_local_voice_intent(transcript: str) -> Optional[dict]:
    """Fast replies/actions that never need the LLM."""
    raw = (transcript or "").strip()
    low = raw.lower()
    if not low:
        return None

    if re.search(r"\b(what can you (do|help with)|who are you|what do you do|help me get started)\b", low):
        return {
            "reply": (
                "I'm Rook. Talk like you would to ChatGPT. I can answer anything about TskFlow, "
                "create and assign tasks, list what's open, update status, search, open any page, "
                "start a recording, or set up a recurring series. What do you want to do?"
            ),
            "action": {"type": "assistant_answer", "params": {}},
        }

    if len(low) < 28 and re.match(r"^(hi|hello|hey|yo|sup)[\s!.]*$", low):
        return {
            "reply": "Hey. What do you want to get done?",
            "action": {"type": "assistant_answer", "params": {}},
        }

    if len(low) < 40 and re.match(r"^(thanks|thank you|thx|cheers)[\s!.]*$", low):
        return {
            "reply": "Anytime. I'm here if you want to keep going.",
            "action": {"type": "assistant_answer", "params": {}},
        }

    if re.search(r"\b(guide me|show yourself|walk me through|help me)\b", low) and len(low) < 80:
        return {
            "reply": "Sure. Tell me what you're stuck on: a task, a page, or how something works.",
            "action": {"type": "assistant_answer", "params": {}},
        }

    search = re.match(r"^(search|find|look up)\s+(?:for\s+)?(.+)$", low)
    if search and not re.match(r"^(find out)\b", low):
        query = search.group(2).strip(" .?")
        if query and query not in {"out", "out how", "out more"}:
            return {
                "reply": f"Searching for {query}.",
                "action": {"type": "search", "params": {"query": query}},
            }

    if re.search(r"\b((start|begin|new)\s+(a\s+)?(screen\s+)?record(ing)?|record (my |the )?screen)\b", low):
        return {
            "reply": "Open the plus menu and hit Record screen. I'll wait here.",
            "action": {"type": "start_recording", "params": {}},
        }

    if re.search(r"\b((create|new|start|make)\s+(a\s+)?recurring|make (this|it) recurring)\b", low):
        return {
            "reply": "Who, what, and how often?",
            "action": {"type": "start_recurring", "params": {}},
        }

    if re.search(r"\b(full form|manual form|advanced (create|form))\b", low) or re.match(r"^/?form\b", low):
        return {
            "reply": "Opening the full form.",
            "action": {"type": "open_form", "params": {}},
        }

    wants_nav = bool(
        re.search(r"\b(open|go to|show|take me to|jump to|navigate)\b", low)
        or re.match(r"^/", low)
        or (len(low) < 28 and _nav_target(low))
    )
    if wants_nav and not re.search(r"\b(ask|assign|create (a )?task|remind)\b", low):
        target = _nav_target(low)
        if target:
            label = target.replace("_", " ")
            return {
                "reply": f"Opening {label}.",
                "action": {"type": "navigate", "params": {"target": target}},
            }

    if re.search(r"\b(how (do|can|does|to)|what(?:'s| is) (a |the )?(task|draft|recurring)|explain|tell me about)\b", low):
        for pattern, reply in _HOWTO:
            if pattern.search(low):
                return {
                    "reply": reply,
                    "action": {"type": "assistant_answer", "params": {}},
                }

    return None
