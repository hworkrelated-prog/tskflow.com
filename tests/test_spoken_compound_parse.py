"""Spoken compound asks like 'I've asked Sam to … share a template for Beck bus'."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BE = ROOT / "backend" / "server.py"
FE_LIB = ROOT / "frontend" / "src" / "lib" / "selfAssign.js"
FE_AI = ROOT / "frontend" / "src" / "components" / "AIQuickCreate.js"

PROMPT = (
    "I've asked Sam to run his account through the AI agent give it the context "
    "and share a good email template with me for Beck bus account"
)


def _copy_helpers():
    src = BE.read_text(encoding="utf-8")
    start = src.index("_DIRECT_HINTS = ")
    end = src.index("async def _llm_vet_title")
    ns = {}
    exec("import re\nfrom typing import Optional, List\n" + src[start:end], ns)
    return ns


def _parse_helpers():
    src = BE.read_text(encoding="utf-8")
    start = src.index("def _round_to_quarter")
    end = src.index("async def _resolve_assignee_hints")
    ns = {}
    exec(
        "import re\nfrom datetime import datetime, timedelta\nfrom typing import Optional, List\n"
        + src[start:end],
        ns,
    )
    return ns


def test_asked_sam_is_the_assignee_not_me():
    ns = _parse_helpers()
    names = [n.lower() for n in ns["_name_hints_from_text"](PROMPT)]
    assert names == ["sam"]
    assert ns["_self_assign_hint"](PROMPT) is False
    assert ns["_prompt_names_other_assignee"](PROMPT) is True
    assert ns["_NOT_SELF_DELIVER_TO_ME_RE"].search(PROMPT)


def test_beck_bus_stays_in_title_and_steps_are_real():
    ns = _copy_helpers()
    parsed = {
        "title": "Share a good email template with me",
        "description": "Share a good email template with me",
        "action_items": [],
        "assignee_hints": ["me"],
    }
    ns["_enrich_parse_title_description"](parsed, PROMPT, manager_name="Henrik")
    title = (parsed.get("title") or "").lower()
    desc = (parsed.get("description") or "").lower()
    assert "beck bus" in title
    assert "with me" not in title
    assert ns["_parse_is_self_assign"](parsed, PROMPT) is False
    assert "please" in desc.split("next steps:")[0]
    assert "do the work" not in desc
    assert "mark this done when i finish" not in desc
    assert "1." in (parsed.get("description") or "")
    assert "template" in desc
    assert "henrik" in desc or "your manager" in desc
    assert "ai agent" in desc or "context" in desc


def test_title_from_work_keeps_account_not_filler():
    ns = _copy_helpers()
    title = ns["_title_from_work_text"](
        "run his account through the AI agent and give it the context "
        "and share a good email template with me for Beck bus account"
    )
    low = title.lower()
    assert "beck bus" in low
    assert "share" in low or "template" in low
    assert "with me" not in low
    assert "a good" not in low


def test_frontend_treats_asked_and_share_with_me_as_delegate():
    lib = FE_LIB.read_text(encoding="utf-8")
    ai = FE_AI.read_text(encoding="utf-8")
    assert "ask(?:ed)?" in lib
    assert "namedSomeoneElse" in ai
    assert "accounts?" in ai
