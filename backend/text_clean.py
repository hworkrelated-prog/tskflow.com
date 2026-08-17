"""Repair UTF-8 / cp1252 mojibake and normalize fancy punctuation to ASCII.

Stored reminder copy often contains double-encoded curly quotes and dashes
that render as Ã¢Â€Â™ / Ã¢Â€Â” in the UI. Undo that, then flatten remaining
typographic punctuation so Chrome toasts and Slack stay readable.
"""
from __future__ import annotations

import re
from typing import Any, Optional

_SKIP_KEYS = {
    "password",
    "hashed_password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "authorization",
    "cookie",
    "signing_secret",
}

_MOJI_MARK = re.compile(r"[\u00c2\u00c3\u00e2\u0080-\u009f\ufffd]")

_PUNCT = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201a": "'",
    "\u201b": "'",
    "\u02bc": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u201e": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2212": "-",
    "\u2551": "-",
    "\u2026": "...",
    "\u00a0": " ",
    "\u2022": "*",
}


def _undo_mojibake(s: str) -> str:
    t = s
    for _ in range(4):
        if not _MOJI_MARK.search(t):
            break
        nxt = None
        for enc in ("cp1252", "latin-1"):
            try:
                cand = t.encode(enc).decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                continue
            if cand != t:
                nxt = cand
                break
        if not nxt:
            break
        t = nxt
    return t


def clean_display_text(s: Optional[str]) -> str:
    if not s:
        return "" if s is None or s == "" else s
    t = _undo_mojibake(str(s))
    for src, dst in _PUNCT.items():
        t = t.replace(src, dst)
    t = re.sub(r"[\u0080-\u009f]", "", t)
    t = _LEFTOVER.sub(_leftover_punct, t)
    t = re.sub(r" {2,}", " ", t)
    return t


_LEFTOVER = re.compile(
    r"(?:\u00c3\u00a2|\u00e2)(?:\s?[\u00c2\u00a0\u20ac\u2018-\u201e\u2122\u2551\u0080-\u009f\-])+"
)


def _leftover_punct(match: re.Match) -> str:
    blob = match.group()
    if any(ch in blob for ch in ("\u2122", "\u2019", "\u2018", "'")):
        return "'"
    if any(ch in blob for ch in ("\u201c", "\u201d", '"')):
        return '"'
    return "-"


def clean_tree(obj: Any, key: Optional[str] = None) -> Any:
    """Walk JSON-like data and clean user-facing strings."""
    if isinstance(obj, str):
        if key and str(key).lower() in _SKIP_KEYS:
            return obj
        return clean_display_text(obj)
    if isinstance(obj, list):
        return [clean_tree(x) for x in obj]
    if isinstance(obj, dict):
        return {k: clean_tree(v, k) for k, v in obj.items()}
    return obj
