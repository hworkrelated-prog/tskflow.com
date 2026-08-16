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
    start = src.index("_SPEECH_VERB_STOP = ")
    end = src.index("async def _llm_vet_title")
    ns = {}
    exec("import re\nfrom typing import Optional, List\n" + src[start:end], ns)
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


def test_self_assign_hint_does_not_steal_other_people():
    ns = _parse_helpers()
    fn = ns["_self_assign_hint"]
    assert fn("Send me an update") is False
    assert fn("Tell me when it's done") is False
    assert fn("have Harold go through this and send me an update") is False
    assert fn("Tell my team that I need to send 100 emails") is False
    assert fn("Ask Sarah to review the deck") is False


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
    assert "please" in (parsed.get("description") or "").lower()
    assert "i need to" not in (parsed.get("description") or "").lower().split("next steps:")[0]


def test_fast_path_wired_in_smart_parse():
    src = BE.read_text(encoding="utf-8")
    assert "_self_assign_hint" in src
    assert "_should_fast_self_parse" in src
    chunk = src[src.index("async def smart_parse_task") : src.index("class QuickCreatePreviewRequest")]
    assert "_should_fast_self_parse(text)" in chunk
    assert 'hints = ["me"]' in chunk
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
    assert "promptMeansSelfAssign(text)" in apply
    assert "setShowPeopleDrop(false)" in apply or "hasAssignees" in apply
    run = ai[ai.index("const runPreview") : ai.index("runPreviewRef.current")]
    assert "SELF_CHIP" in run
    assert "rememberedAssigneesForPrompt" in run
