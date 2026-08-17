"""Self vs delegate copy is inferred, then made logical."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "backend" / "server.py"
FRONT = ROOT / "frontend" / "src"


def test_parse_runs_logic_pass_and_flags_self_assign():
    src = SERVER.read_text(encoding="utf-8")
    assert "async def _llm_logical_copy" in src
    assert "Voice: " in src
    assert "SELF-ASSIGNED personal reminder" in src
    assert "DELEGATED to someone else" in src
    assert 'parsed["self_assign"]' in src
    assert "_copy_looks_illogical" in src
    assert "_looks_truncated" in src
    assert "_should_fast_self_parse(text)" not in src.split("async def smart_parse_task")[1].split("class QuickCreatePreviewRequest")[0]


def test_title_from_reminder_prompt_is_the_work():
    src = SERVER.read_text(encoding="utf-8")
    start = src.index("_DIRECT_HINTS = ")
    end = src.index("async def _llm_vet_title")
    ns = {}
    exec("import re\nfrom typing import Optional, List\n" + src[start:end], ns)
    title = ns["_title_from_work_text"]("This is a reminder for myself to review all deals")
    assert "reminder" not in title.lower()
    assert "complete this" not in title.lower()
    assert "review" in title.lower()
    assert ns["_copy_looks_illogical"](
        "Complete This is a reminder for myself",
        "This is a reminder for myself to make sure I for all deals I\n1. Complete the",
    )
    steps = ns["_infer_next_steps"]("review deals", "Review deals", self_assign=True)
    assert all("reply with a brief update" not in s.lower() for s in steps)


def test_cards_rewrite_self_assign_voice():
    card = (FRONT / "components" / "TaskCard.js").read_text(encoding="utf-8")
    detail = (FRONT / "pages" / "TaskDetail.js").read_text(encoding="utf-8")
    desc = (FRONT / "lib" / "taskDescription.js").read_text(encoding="utf-8")
    fmt = (FRONT / "components" / "FormattedTaskDescription.js").read_text(encoding="utf-8")
    ai = (FRONT / "components" / "AIQuickCreate.js").read_text(encoding="utf-8")
    assert "rewriteSelfAssignCopy" in card
    assert "assigned_to === task.created_by" in card
    assert "isSelf=" in detail
    assert "this is a reminder for myself\\s+to" in desc
    assert "Mark this done when I finish" in desc
    assert "isSelf" in fmt
    assert "p.self_assign" in ai
    assert "timeout: 35000" in ai
