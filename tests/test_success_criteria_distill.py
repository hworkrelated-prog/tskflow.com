"""Every distilled task gets instructions + a success bar, including self-assign."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


def _ns():
    start = SRC.index("_DIRECT_HINTS = ")
    end = SRC.index("async def _llm_vet_title")
    ns = {}
    exec(
        "import re\nfrom typing import Optional, List\n"
        "def first_name(name, fallback=''):\n"
        "    p = (name or '').strip().split()\n"
        "    return p[0] if p else fallback\n" + SRC[start:end],
        ns,
    )
    return ns


def test_prompt_requires_success_criteria_for_every_task():
    assert "SUCCESS CRITERIA" in SRC
    assert "Never leave success_criteria empty" in SRC
    assert "including self-assigned" in SRC
    assert "def _ensure_success_criteria" in SRC
    assert "_task_llm_model()" in SRC
    assert 'or "gpt-4o"' in SRC


def test_delegated_task_gets_criteria():
    ns = _ns()
    parsed = {
        "title": "Tell that on Monday we need to finish outreach training",
        "description": "Tell my team that on Monday we need to finish outreach training",
        "action_items": [],
        "assignee_hints": ["my team"],
        "success_criteria": "",
    }
    ns["_enrich_parse_title_description"](
        parsed, "Tell my team that on Monday we need to finish outreach training", manager_name="Henrik"
    )
    assert (parsed.get("description") or "").lower().count("please") >= 1
    crit = (parsed.get("success_criteria") or "").strip()
    assert crit
    assert "tell my team" not in crit.lower()
    assert "finished" in crit.lower() or "done" in crit.lower() or "complete" in crit.lower()


def test_self_assigned_task_gets_first_person_criteria():
    ns = _ns()
    raw = "Remind me to review open deals before my 1:1"
    parsed = {
        "title": raw,
        "description": raw,
        "action_items": [],
        "assignee_hints": ["me"],
        "success_criteria": "",
    }
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Ada", current_user={"id": "u1", "name": "Ada"})
    crit = (parsed.get("success_criteria") or "").strip()
    assert crit
    assert crit.lower().startswith("i've finished") or crit.lower().startswith("i have")
    desc = (parsed.get("description") or "").lower()
    assert "please" not in desc.split("next steps:")[0]


def test_stated_criteria_is_kept():
    ns = _ns()
    parsed = {
        "title": "Send the pricing PDF",
        "description": "Please send the pricing PDF",
        "action_items": [],
        "assignee_hints": ["Sam"],
        "success_criteria": "Clean PDF with pricing, sent to the client, CC me",
    }
    ns["_enrich_parse_title_description"](parsed, "Have Sam send the pricing PDF. Done well: clean PDF, CC me", manager_name="Henrik")
    assert "Clean PDF" in (parsed.get("success_criteria") or "")
