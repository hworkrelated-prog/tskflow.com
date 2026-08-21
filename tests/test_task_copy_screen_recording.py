"""Assignee-facing screen-recording copy must stay logical — no 'with their' / Additional info."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "backend" / "server.py"
FRONT = ROOT / "frontend" / "src"


def _helpers():
    src = SERVER.read_text(encoding="utf-8")
    start = src.index("_DIRECT_HINTS = ")
    end = src.index("async def _llm_vet_title")
    ns = {}
    exec("import re\nfrom typing import Optional, List\n" + src[start:end], ns)
    return ns


def test_strip_additional_info_and_assign_to_asap():
    ns = _helpers()
    leaked = (
        "Please review and respond with a screen recording with their understanding "
        "of the work that's been assigned. Additional info: When should this be done by?: ASAP. "
        "Assign to ASAP."
    )
    cleaned = ns["_strip_clarify_leakage"](leaked)
    assert "Additional info" not in cleaned
    assert "Assign to ASAP" not in cleaned
    assert "When should this be done by?" not in cleaned


def test_rewrite_screen_recording_ask_is_second_person():
    ns = _helpers()
    out = ns["_rewrite_description_for_assignee"](
        "Please review and respond with a screen recording with their understanding "
        "of the work that's been assigned."
    )
    assert "with their" not in out.lower()
    assert "your understanding" in out.lower()
    assert "Additional info" not in out


def test_normalize_lays_out_clean_screen_recording_ask():
    ns = _helpers()
    out = ns["_normalize_description_layout"](
        "Please review and respond with a screen recording with their understanding "
        "of the work that's been assigned. Additional info: When should this be done by?: ASAP. "
        "Assign to ASAP.\n\nNext steps:\n1. Review the material.\n2. Reply with a brief update when you are done."
    )
    assert "Additional info" not in out
    assert "Assign to ASAP" not in out
    assert "with their" not in out.lower()
    assert "your understanding" in out.lower()
    assert "Next steps:" in out


def test_copy_looks_illogical_flags_leakage():
    ns = _helpers()
    assert ns["_copy_looks_illogical"](
        "Review with recording",
        "Please review. Additional info: When should this be done by?: ASAP. Assign to ASAP.",
    )
    assert ns["_copy_looks_illogical"](
        "Review with recording",
        "Please reply with a screen recording with their understanding of the work.",
    )


def test_answers_context_never_says_additional_info():
    ns = _helpers()
    ctx = ns["_answers_as_natural_context"]({
        "When should this be done by?": "ASAP",
        "Who should own this task?": "My team",
    })
    assert "Additional info" not in ctx
    assert "Assign to ASAP" not in ctx
    assert "due ASAP" in ctx.lower() or "due asap" in ctx.lower()
    assert "My team" in ctx


def test_frontend_layout_strips_leakage():
    desc = (FRONT / "lib" / "taskDescription.js").read_text(encoding="utf-8")
    assert "Additional info" in desc
    assert "with their understanding" in desc
    assert "your understanding" in desc
    quick = (FRONT / "components" / "AIQuickCreate.js").read_text(encoding="utf-8")
    assert "!isWhenClarify" in quick
    assert "clarify-groups-header" in quick
    assert "Groups appear first" in quick or "mentionGroups.map" in quick
