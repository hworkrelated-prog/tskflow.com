"""Spoken compound asks like 'I've asked Sam to … share a template for Beck bus'."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BE = ROOT / "backend" / "server.py"
FE_LIB = ROOT / "frontend" / "src" / "lib" / "selfAssign.js"
FE_AI = ROOT / "frontend" / "src" / "components" / "AIQuickCreate.js"

PROMPT = (
    "I've asked Sam to run his account through the AI agent give it the context "
    "and share a good email template with me for Beck bus account"
)

VARIANTS = [
    PROMPT,
    "I asked Sam to run his account through the AI agent and share a good email template with me for Beck bus account",
    "I told Sam to run the Beck bus account through chatgpt and send me a template",
    "Ask Sam to run his account through the AI agent and share an email template for Beck bus",
    "I want Sam to share a good email template with me for Beck bus account",
    "please ask sam to draft me an email template for Beck bus account",
]


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


def _enrich(raw, hints=None):
    ns = _copy_helpers()
    parsed = {
        "title": "Share a good email template with me",
        "description": "Share a good email template with me",
        "action_items": [],
        "assignee_hints": hints if hints is not None else ["me"],
    }
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Henrik")
    return ns, parsed


def test_asked_sam_is_the_assignee_not_me():
    ns = _parse_helpers()
    for raw in VARIANTS:
        names = [n.lower() for n in ns["_name_hints_from_text"](raw)]
        assert "sam" in names, raw
        assert ns["_self_assign_hint"](raw) is False, raw
        assert ns["_prompt_names_other_assignee"](raw) is True, raw


def test_lowercase_and_want_and_told():
    ns = _parse_helpers()
    assert [n.lower() for n in ns["_name_hints_from_text"]("i asked sam to send the deck")] == ["sam"]
    assert [n.lower() for n in ns["_name_hints_from_text"]("I want Maya to review this")] == ["maya"]
    assert [n.lower() for n in ns["_name_hints_from_text"]("have Jordan run his account through the AI")] == ["jordan"]
    assert ns["_name_hints_from_text"]("I need to send 100 emails") == []
    assert ns["_name_hints_from_text"]("tell my team to finish training") == []


def test_deliver_to_me_is_not_self_assign():
    ns = _parse_helpers()
    fn = ns["_self_assign_hint"]
    assert fn("share a good email template with me for Beck bus account") is False
    assert fn("draft me an email template") is False
    assert ns["_NOT_SELF_DELIVER_TO_ME_RE"].search("share a template for me")
    assert ns["_NOT_SELF_DELIVER_TO_ME_RE"].search("shoot me a template")


def test_beck_bus_stays_in_title_and_steps_are_real():
    ns, parsed = _enrich(PROMPT)
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
    lead = desc.split("next steps:")[0]
    assert "ai agent agent" not in lead
    assert "the beck bus" in lead or "beck bus account" in lead


def test_variants_keep_sam_and_beck_bus():
    for raw in VARIANTS:
        ns, parsed = _enrich(raw, hints=["me"])
        title = (parsed.get("title") or "").lower()
        desc = (parsed.get("description") or "").lower()
        assert "beck" in title or "beck" in desc, raw
        assert ns["_parse_is_self_assign"](parsed, raw) is False, raw
        assert "do the work" not in desc, raw


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


def test_copy_drops_prompt_facts_rejects_generic_stub():
    ns = _copy_helpers()
    assert ns["_copy_drops_prompt_facts"](
        PROMPT, "Share a good email template with me", "1. Do the work."
    )
    assert not ns["_copy_drops_prompt_facts"](
        PROMPT,
        "Share email template for Beck bus account",
        "Please run the Beck bus account through the AI agent.",
    )


def test_possessive_and_chatgpt_subject():
    ns = _copy_helpers()
    assert "beck" in ns["_subject_for_phrase"]("send a template for Beck Bus's account").lower()
    parsed = {
        "title": "Share template",
        "description": "Share template",
        "action_items": [],
        "assignee_hints": ["Sam"],
    }
    raw = "I told Sam to run Beck bus's account through chatgpt and share a template with me"
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Henrik")
    blob = f"{parsed.get('title')} {parsed.get('description')}".lower()
    assert "beck" in blob
    assert "ai agent" in blob or "template" in blob


def test_frontend_treats_asked_and_share_with_me_as_delegate():
    lib = FE_LIB.read_text(encoding="utf-8")
    ai = FE_AI.read_text(encoding="utf-8")
    assert "ASKED_TO_NAME_RE" in lib
    assert "subjectForPhrase" in lib
    assert "namedSomeoneElse" in ai
    assert "titleMissesAccount" in ai
    script = r"""
import { nameHintsFromText, promptMeansSelfAssign, subjectForPhrase } from './frontend/src/lib/selfAssign.js';
const p = "I've asked Sam to run his account through the AI agent give it the context and share a good email template with me for Beck bus account";
if (nameHintsFromText(p).map((n) => n.toLowerCase()).join() !== 'sam') process.exit(2);
if (promptMeansSelfAssign(p)) process.exit(3);
if (!/beck bus/i.test(subjectForPhrase(p))) process.exit(4);
if (promptMeansSelfAssign('I need to send 100 emails') !== true) process.exit(5);
console.log('ok');
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert "ok" in result.stdout
