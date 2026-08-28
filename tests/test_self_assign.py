"""Self-assign: 'remind me' / 'I need to' means me, plus exact minute due dates."""
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BE = ROOT / "backend" / "server.py"
FE_LIB = ROOT / "frontend" / "src" / "lib" / "selfAssign.js"
FE_AI = ROOT / "frontend" / "src" / "components" / "AIQuickCreate.js"


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


def _copy_helpers():
    src = BE.read_text(encoding="utf-8")
    start = src.index("_DIRECT_HINTS = ")
    end = src.index("async def _llm_vet_title")
    ns = {}
    exec(
        "import re\nfrom typing import Optional, List\n"
        "def first_name(name, fallback=''):\n"
        "    p = (name or '').strip().split()\n"
        "    return p[0] if p else fallback\n" + src[start:end],
        ns,
    )
    return ns


def test_self_assign_hint_remind_me_and_first_person():
    ns = _parse_helpers()
    fn = ns["_self_assign_hint"]
    assert fn("Remind me in 10 minutes that I need to send 100 emails") is True
    assert fn("I need to send 100 emails") is True
    assert fn("I'll follow up with the client tomorrow") is True
    assert fn("Assign this to me") is True
    assert fn("Nudge me to call Jordan") is True
    assert fn("@me send the deck") is True
    assert fn("a reminder for myself") is True
    assert fn("Prepare for our 1:1") is True


def test_self_assign_hint_does_not_steal_other_people():
    ns = _parse_helpers()
    fn = ns["_self_assign_hint"]
    assert fn("Send me an update") is False
    assert fn("Tell me when it's done") is False
    assert fn("have Harold go through this and send me an update") is False
    assert fn("Tell my team that I need to send 100 emails") is False
    assert fn("Ask Sarah to review the deck") is False
    assert fn("Have Harold prepare for our 1:1") is False
    assert fn("Benjamin needs to review and clear all redundant open opportunities by 1 pm PST today.") is False


def test_in_10_minutes_is_exact_not_ten_oclock():
    ns = _parse_helpers()
    now = datetime(2026, 8, 16, 17, 59, 0)
    raw = "Remind me in 10 minutes that I need to send 100 emails"
    got = ns["_fallback_parse_date_expression"](raw, now)
    assert got == (now + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M")
    # "in 2 hours" still works and is not read as 2:00
    got_h = ns["_fallback_parse_date_expression"]("Remind me in 2 hours to call", now)
    assert got_h == ns["_round_to_quarter"](now + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M")


def test_remind_me_strips_to_the_work():
    ns = _copy_helpers()
    raw = "Remind me in 10 minutes that I need to send 100 emails"
    stripped = ns["_strip_manager_voice"](raw).lower()
    assert "remind me" not in stripped
    when, work = ns["_split_when_and_work"](raw)
    assert "10" in when and "minute" in when.lower()
    assert "send 100 emails" in work.lower()
    assert "i need to" not in work.lower()
    title = ns["_title_from_work_text"](work)
    assert title.lower().startswith("send")
    assert "100" in title
    parsed = {
        "title": raw,
        "description": raw,
        "action_items": [],
        "assignee_hints": ["me"],
    }
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Jordan")
    assert "remind" not in (parsed.get("title") or "").lower()
    assert "send" in (parsed.get("title") or "").lower()
    lead = (parsed.get("description") or "").lower().split("next steps:")[0]
    assert "please" not in lead
    assert "i need to" not in lead
    assert "send 100 emails" in (parsed.get("description") or "").lower()
    assert "\n1." in (parsed.get("description") or "")


def test_self_assign_our_1on1_becomes_my():
    ns = _copy_helpers()
    parsed = {
        "title": "Prepare for our 1:1",
        "description": "Prepare for our 1:1",
        "action_items": [],
        "assignee_hints": ["me"],
    }
    ns["_enrich_parse_title_description"](parsed, "Prepare for our 1:1")
    title = (parsed.get("title") or "").lower()
    desc = (parsed.get("description") or "").lower()
    assert "our" not in title
    assert "my 1:1" in title
    assert "our" not in desc.split("next steps:")[0]
    assert "please" not in desc.split("next steps:")[0]
    assert "\n1." in (parsed.get("description") or "")


def test_prepare_for_1on1_without_hints_is_self():
    ns = _copy_helpers()
    parsed = {
        "title": "Prepare for our 1:1",
        "description": "Prepare for our 1:1",
        "action_items": [],
        "assignee_hints": [],
    }
    ns["_enrich_parse_title_description"](parsed, "Prepare for our 1:1")
    assert "my 1:1" in (parsed.get("title") or "").lower()
    assert "our" not in (parsed.get("title") or "").lower()
    title, desc = ns["_apply_self_assign_copy"](
        "Prepare for our 1:1",
        "Tomorrow, please prepare for our 1:1.\n\nNext steps:\n1. Complete the ask above.\n2. Reply with a brief update when you are done.",
    )
    assert "my 1:1" in title.lower()
    assert "please" not in desc.lower().split("next steps:")[0]
    assert "reply with a brief update" not in desc.lower()
    assert "mark this done" in desc.lower()


def test_self_assign_by_own_user_chip_rewrites_our():
    ns = _copy_helpers()
    parsed = {
        "title": "Prepare for our 1:1",
        "description": "Prepare for our 1:1",
        "action_items": [],
        "assignee_hints": ["Henrik"],
        "assignee_resolution": {
            "resolved": [{"id": "u1", "name": "Henrik Morgan", "email": "henrik@acme.com"}],
        },
    }
    ns["_enrich_parse_title_description"](
        parsed,
        "Prepare for our 1:1",
        manager_name="Henrik Morgan",
        current_user={"id": "u1", "name": "Henrik Morgan", "email": "henrik@acme.com"},
    )
    title = (parsed.get("title") or "").lower()
    desc = (parsed.get("description") or "").lower()
    assert "our" not in title
    assert "my 1:1" in title
    assert "our" not in desc.split("next steps:")[0]
    assert "please" not in desc.split("next steps:")[0]


def test_reminder_for_myself_is_personal_not_slack_them():
    ns = _copy_helpers()
    raw = "This is a reminder for myself to make sure I get all DMC prepared for all deals I have for Monday"
    parsed = {
        "title": raw,
        "description": raw,
        "action_items": [],
        "assignee_hints": ["me"],
    }
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Henrik")
    title = (parsed.get("title") or "").lower()
    desc = (parsed.get("description") or "").lower()
    assert "reminder for myself" not in title
    assert "complete this is" not in title
    assert "dmc" in title or "prepare" in title
    assert "please" not in desc.split("next steps:")[0]
    assert "them" not in desc
    assert "\n1." in (parsed.get("description") or "")


def test_self_assign_always_runs_llm_then_logic_pass():
    src = BE.read_text(encoding="utf-8")
    assert "_self_assign_hint" in src
    chunk = src[src.index("async def smart_parse_task") : src.index("class QuickCreatePreviewRequest")]
    assert "await _llm_parse" in chunk
    assert "_should_fast_self_parse(text)" not in chunk
    assert 'hints = ["me"]' in chunk
    assert "_llm_logical_copy" in chunk
    assert 'parsed["self_assign"]' in chunk
    assert "in N minutes" in src or "in N minutes/mins" in src


def test_frontend_self_assign_and_memory():
    lib = FE_LIB.read_text(encoding="utf-8")
    ai = FE_AI.read_text(encoding="utf-8")
    assert "export function promptMeansSelfAssign" in lib
    assert "tskflow_ai_last_assignees" in lib
    assert "sessionStorage" in lib
    assert "promptMeansSelfAssign" in ai
    assert "rememberedAssigneesForPrompt" in ai
    assert "writeLastAssignees" in ai
    assert "SELF_CHIP" in ai
    apply = ai[ai.index("const applyPreview") : ai.index("const runQA")]
    assert "promptMeansSelfAssign(sourceText)" in apply
    assert "matchAssigneesFromPeople" in apply
    assert "setShowPeopleDrop(false)" in apply or "hasAssignees" in apply
    run = ai[ai.index("const runPreview") : ai.index("runPreviewRef.current")]
    assert "SELF_CHIP" in run
    assert "rememberedAssigneesForPrompt" in run
