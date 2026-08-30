"""Hound: Slack chase + launch.

Chase is the DM after two ignored pings, with tap buttons.
Launch is `/hound` — type an ask in Slack, confirm, it fans out.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs

import httpx

from brand import ASSISTANT_NAME, SLACK_PRODUCT

logger = logging.getLogger("tskflow.hound")

HOUND_SLASH = "hound"
SLACK_BOT_SCOPES = (
    "incoming-webhook,chat:write,im:write,im:history,users:read,"
    "users:read.email,commands"
)

ACTION_ACCEPT = "hound_accept"
ACTION_DECLINE = "hound_decline"
ACTION_BLOCK = "hound_block"
ACTION_DONE = "hound_done"
ACTION_LAUNCH_CONFIRM = "hound_launch_confirm"
ACTION_LAUNCH_CANCEL = "hound_launch_cancel"
ACTION_SILENT = "hound_silent"
ACTION_LAUNCH_HINT = "hound_launch_hint"

BUTTON_TO_INTENT = {
    ACTION_ACCEPT: "accept",
    ACTION_DECLINE: "decline",
    ACTION_BLOCK: "block",
    ACTION_DONE: "complete",
}


def hound_bot_token() -> str:
    return (os.getenv("SLACK_BOT_TOKEN") or "").strip()


def parse_hound_slash(text: str) -> dict:
    """Turn `/hound …` text into a command. No LLM."""
    raw = (text or "").strip()
    low = raw.lower()
    if not raw or low in ("help", "?", "hi", "hey"):
        return {"kind": "help"}
    if low in ("silent", "quiet", "chase", "who", "who’s silent", "who's silent", "nudge"):
        return {"kind": "silent"}
    stripped = re.sub(r"^(hound|ask|tell|remind)\s+", "", raw, flags=re.I).strip() or raw
    return {"kind": "launch", "text": stripped}


def parse_slash_payload(body: bytes) -> dict:
    """Slack slash commands post application/x-www-form-urlencoded."""
    parsed = parse_qs((body or b"").decode("utf-8"), keep_blank_values=True)
    def one(key: str) -> str:
        vals = parsed.get(key) or []
        return str(vals[0]) if vals else ""
    return {
        "command": one("command").lstrip("/"),
        "text": one("text"),
        "user_id": one("user_id"),
        "user_name": one("user_name"),
        "team_id": one("team_id"),
        "response_url": one("response_url"),
        "trigger_id": one("trigger_id"),
        "channel_id": one("channel_id"),
    }


def parse_interact_payload(body: bytes) -> Optional[dict]:
    parsed = parse_qs((body or b"").decode("utf-8"), keep_blank_values=True)
    raw = (parsed.get("payload") or [""])[0]
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def interact_action(payload: dict) -> Tuple[str, str]:
    """Return (action_id, value) from a block_actions payload."""
    actions = (payload or {}).get("actions") or []
    if not actions:
        return "", ""
    first = actions[0] or {}
    return str(first.get("action_id") or ""), str(first.get("value") or "")


def chase_blocks(task: dict, opening: str) -> List[dict]:
    task_id = str((task or {}).get("id") or "")
    title = str((task or {}).get("title") or "this")
    return [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*{title}*\n{opening}"},
        },
        {
            "type": "actions",
            "block_id": f"hound_chase_{task_id}",
            "elements": [
                _btn("On it", ACTION_ACCEPT, task_id, primary=True),
                _btn("Can't", ACTION_DECLINE, task_id),
                _btn("Blocked", ACTION_BLOCK, task_id),
                _btn("Done", ACTION_DONE, task_id),
            ],
        },
    ]


def help_blocks() -> List[dict]:
    return [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*{SLACK_PRODUCT}*"},
        },
        {
            "type": "actions",
            "elements": [
                _btn("Who went silent", ACTION_SILENT, "silent", primary=True),
            ],
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"`/{HOUND_SLASH} ask sales to log every call by 5`",
                }
            ],
        },
    ]


def silent_blocks(names: List[str], total_silent: int) -> List[dict]:
    if not names:
        return [{
            "type": "section",
            "text": {"type": "mrkdwn", "text": "*Clear.* Nobody’s sitting silent."},
        }]
    shown = names[:12]
    extra = total_silent - len(shown)
    people = "\n".join(f"• {n}" for n in shown)
    if extra > 0:
        people += f"\n• +{extra}"
    return [
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Silent · {total_silent}*\n{people}"},
        }
    ]


def launch_preview_blocks(launch_id: str, title: str, who: str, when: str) -> List[dict]:
    who_bit = who or "—"
    when_bit = when or "—"
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{title}*\n{who_bit}  ·  {when_bit}",
            },
        },
        {
            "type": "actions",
            "block_id": f"hound_launch_{launch_id}",
            "elements": [
                _btn("Send", ACTION_LAUNCH_CONFIRM, launch_id, primary=True),
                _btn("Cancel", ACTION_LAUNCH_CANCEL, launch_id),
            ],
        },
    ]


def launch_need_more_blocks(question: str) -> List[dict]:
    q = (question or "Who, and by when?").strip()
    return [{
        "type": "section",
        "text": {"type": "mrkdwn", "text": f"{q}\n`/{HOUND_SLASH} {q}`"},
    }]


def _btn(label: str, action_id: str, value: str, primary: bool = False) -> dict:
    el: Dict[str, Any] = {
        "type": "button",
        "text": {"type": "plain_text", "text": label, "emoji": True},
        "action_id": action_id,
        "value": value,
    }
    if primary:
        el["style"] = "primary"
    if action_id == ACTION_DECLINE:
        el["style"] = "danger"
    return el


def format_who_line(resolution: Optional[dict], fallback: str = "") -> str:
    ar = resolution or {}
    names: List[str] = []
    for row in ar.get("resolved") or []:
        if row.get("kind") == "team":
            n = len(row.get("members") or row.get("emails") or [])
            label = row.get("name") or "team"
            names.append(f"{label} ({n})" if n else label)
        else:
            names.append(row.get("name") or row.get("email") or "")
    names = [n for n in names if n]
    if not names:
        return fallback
    if len(names) <= 3:
        return ", ".join(names)
    return f"{names[0]} +{len(names) - 1}"


def slack_ephemeral(text: str, blocks: Optional[List[dict]] = None) -> dict:
    payload: Dict[str, Any] = {"response_type": "ephemeral", "text": text or SLACK_PRODUCT}
    if blocks:
        payload["blocks"] = blocks
    return payload


def intent_from_action(action_id: str) -> Optional[str]:
    return BUTTON_TO_INTENT.get(action_id)


async def post_response_url(response_url: str, payload: dict) -> bool:
    if not (response_url or "").startswith("https://"):
        return False
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(response_url, json=payload)
            return r.status_code < 400
    except Exception as e:
        logger.warning("Hound response_url failed: %s", e)
        return False


def is_hound_notification(title: Optional[str], body: Optional[str] = None) -> bool:
    blob = f"{title or ''} {body or ''}".lower()
    if SLACK_PRODUCT.lower() in blob:
        return True
    if ASSISTANT_NAME.lower() in blob and "slack" in blob:
        return True
    return False
