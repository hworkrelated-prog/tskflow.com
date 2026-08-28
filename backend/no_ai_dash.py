"""Never ship em dashes or en dashes in product copy."""
from __future__ import annotations

import re

_DASH = re.compile(r"[\u2013\u2014\u2212\u2551]")
_DASH_GAP = re.compile(r"\s*[\u2013\u2014\u2212]\s*")


def strip_ai_dashes(text: str) -> str:
    if not text:
        return "" if text is None or text == "" else text
    t = _DASH_GAP.sub(" - ", str(text))
    t = _DASH.sub("-", t)
    t = re.sub(r" {2,}", " ", t)
    t = re.sub(r"-{2,}", "-", t)
    return t.strip()


def first_name(name: str) -> str:
    part = (name or "").strip().split()
    return part[0] if part else ""
