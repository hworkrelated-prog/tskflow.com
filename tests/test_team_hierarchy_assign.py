"""Composer team assignment: Motive-style hierarchy, no fake gmail teams, o'clock due dates."""
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BE = ROOT / "backend" / "server.py"
FE_AI = ROOT / "frontend" / "src" / "components" / "AIQuickCreate.js"
FE_LIB = ROOT / "frontend" / "src" / "lib" / "selfAssign.js"
FE_TEAM = ROOT / "frontend" / "src" / "pages" / "TeamManagementPage.js"


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


def test_never_invents_everyone_in_gmail():
    src = BE.read_text(encoding="utf-8")
    resolve = src[src.index("async def _resolve_assignee_hints") : src.index("def _repair_speech_prompt")]
    assert "Everyone in" not in resolve
    assert "_team_assignment_plan" in src
    assert "needs_team_setup" in resolve
    assert "needs_scope_pick" in resolve


def test_team_assignment_plan_motive_org():
    ns = _parse_helpers()
    plan = ns["_team_assignment_plan"]
    # Regional director: 5 managers, each with AEs → ask which scope for "my team"
    assert plan("team", 5, 25) == "ask_scope"
    assert plan("direct", 5, 25) == "direct"
    assert plan("everyone", 5, 25) == "everyone"
    assert plan("skip", 5, 25) == "skip"
    # Manager with only AEs, no skip-level
    assert plan("team", 5, 0) == "direct"
    # No hierarchy at all — never invent a domain team
    assert plan("team", 0, 0) == "ask_who"
    assert plan("everyone", 0, 0) == "ask_who"


def test_classify_team_phrases():
    ns = _parse_helpers()
    fn = ns["_classify_team_hint"]
    assert fn("my team") == "team"
    assert fn("my managers") == "direct"
    assert fn("my direct reports") == "direct"
    assert fn("everyone under me") == "everyone"
    assert fn("my org") == "everyone"
    assert fn("my manager's teams") == "skip"
    assert fn("my aes") == "skip"


def test_oclock_pacific_tomorrow_parses():
    ns = _parse_helpers()
    now = datetime(2026, 8, 30, 9, 0, 0)
    got = ns["_fallback_parse_date_expression"]("By 12 o'clock Pacific time tomorrow", now)
    assert got == (now + timedelta(days=1)).replace(hour=12, minute=0).strftime("%Y-%m-%dT%H:%M")
    assert ns["_looks_like_time_only"]("By 12 o'clock Pacific time tomorrow") is True
    classified = ns["_classify_clarify_answer"](
        "When should this be done by?",
        "By 12 o'clock Pacific time tomorrow",
    )
    assert classified.get("when")
    assert "who" not in classified


def test_blended_who_and_when_answer():
    ns = _parse_helpers()
    classified = ns["_classify_clarify_answer"](
        "When should this be done by?",
        "Bharat 12 o'clock Pacific time tomorrow",
    )
    assert classified.get("who", "").lower() == "bharat"
    assert classified.get("when")
    remapped = ns["_remap_clarify_answers"]({
        "When should this be done by?": "Bharat 12 o'clock Pacific time tomorrow",
    })
    assert remapped.get("Who should this be assigned to?", "").lower() == "bharat"
    assert "When should this be done by?" in remapped


def test_fast_parse_skips_llm_for_team_asks():
    ns = _parse_helpers()
    assert ns["_should_fast_parse"](
        "Ask my team to review all of their opportunities and updates SFDC hygiene"
    ) is True
    assert ns["_should_fast_parse"]("Ask my managers to review SFDC hygiene by noon tomorrow") is True
    assert ns["_text_has_team_phrase"]("Ask everyone under me to update opportunities") is True


def test_composer_asks_who_before_when():
    src = FE_AI.read_text(encoding="utf-8")
    send = src[src.index("const send = async") : src.index("setSending(true);")]
    assert send.index("unique.length === 0") < send.index("if (!editDue)")
    assert "teamScopePrompt" in send
    assert "Set up your team" in src
    assert "needs_team_setup" in src
    assert "pendingScope" in src
    assert "promptNamesSomeoneElse(sourceText)" not in src[src.index("const hasAssignees") : src.index("const nextPreview")]


def test_frontend_time_and_blend():
    lib = FE_LIB.read_text(encoding="utf-8")
    assert "splitWhoWhenBlend" in lib
    assert "o'?clock" in lib or "o'clock" in lib
    assert "pacific" in lib.lower()


def test_teams_page_explains_direct_vs_org():
    src = FE_TEAM.read_text(encoding="utf-8")
    assert 'data-testid="hierarchy-assign-hint"' in src
    assert "my managers" in src
    assert "everyone under me" in src
    assert "regional director" in src.lower()
