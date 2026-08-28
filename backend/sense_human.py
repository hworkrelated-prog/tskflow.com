"""Make sense of messy human input before it is stored or acted on."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List

from no_ai_dash import strip_ai_dashes
from text_clean import clean_display_text

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

SENSE_SYSTEM = strip_ai_dashes(
    """You tidy messy human input for TskFlow.
Never use em dashes or en dashes. Use commas, periods, or a hyphen.
Return JSON only: {"text": "<cleaned meaning-preserving text>", "emails": ["a@b.co"], "summary": "<optional one line>"}
Extract every email. If someone wrote "bob at acme dot com", convert it.
Keep names and facts. Be respectful. Do not invent work."""
)


def extract_emails(text: str) -> List[str]:
    found = [m.group(0).lower() for m in EMAIL_RE.finditer(text or "")]
    out: List[str] = []
    for email in found:
        if email not in out:
            out.append(email)
    return out


def _merge_emails(*groups: List[str]) -> List[str]:
    out: List[str] = []
    for group in groups:
        for raw in group or []:
            email = str(raw or "").strip().lower()
            if "@" in email and email not in out:
                out.append(email)
    return out


async def sense_human_text(text: str, kind: str = "prose") -> Dict[str, Any]:
    raw = text or ""
    kind = (kind or "prose").strip().lower()
    emails = extract_emails(raw)
    cleaned = strip_ai_dashes(clean_display_text(raw)).strip()
    try:
        from llm import chat_complete, get_openai_api_key

        if get_openai_api_key() and raw.strip():
            out = await chat_complete(
                model="gpt-4o-mini",
                user=f"kind={kind}\n\n{raw}",
                system=SENSE_SYSTEM,
                timeout=6.0,
                json_mode=True,
            )
            data = json.loads(out or "{}")
            text2 = strip_ai_dashes(clean_display_text(str(data.get("text") or cleaned)))
            extra = data.get("emails") if isinstance(data.get("emails"), list) else []
            return {
                "ok": True,
                "text": (text2 or cleaned).strip(),
                "emails": _merge_emails(emails, [str(x) for x in extra]),
                "summary": strip_ai_dashes(str(data.get("summary") or "")),
            }
    except Exception:
        pass
    return {"ok": True, "text": cleaned, "emails": emails, "summary": ""}
