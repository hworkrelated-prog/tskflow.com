"""Distill manager commands into assignee-facing task copy."""
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


def test_incomplete_tell_my_team_is_not_pasted():
    ns = _ns()
    parsed = {
        "title": "Tell that on Monday we need to",
        "description": "Tell my team that on Monday we need to",
        "action_items": [],
        "assignee_hints": ["my team"],
    }
    ns["_enrich_parse_title_description"](
        parsed, "Tell my team that on Monday we need to", manager_name="Henrik"
    )
    title = (parsed.get("title") or "").lower()
    desc = (parsed.get("description") or "").lower()
    assert "tell that" not in title
    assert "tell my team" not in desc
    assert "we need to" not in title
    assert "monday" in title or "monday" in desc
    assert "please" in desc


def test_full_tell_my_team_becomes_direct_ask():
    ns = _ns()
    parsed = {
        "title": "Tell that on Monday we need to finish outreach training",
        "description": "Tell my team that on Monday we need to finish outreach training",
        "action_items": [],
        "assignee_hints": ["my team"],
    }
    raw = "Tell my team that on Monday we need to finish outreach training"
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Henrik")
    title = parsed.get("title") or ""
    desc = parsed.get("description") or ""
    assert "outreach" in title.lower()
    assert not title.lower().startswith("tell")
    assert "tell my team" not in desc.lower()
    assert "please" in desc.lower()
    assert "monday" in desc.lower()
    assert "finish" in desc.lower() or "outreach" in desc.lower()
    assert ns["_too_close_to_prompt"](desc, raw) is False


def test_strip_manager_voice_handles_that_and_need_to():
    ns = _ns()
    assert ns["_strip_manager_voice"]("Tell my team that on Monday we need to").lower() == "on monday"
    out = ns["_strip_manager_voice"](
        "Tell my team that on Monday we need to finish outreach training"
    ).lower()
    assert "tell" not in out
    assert "finish outreach" in out


def test_ask_my_team_becomes_please_complete():
    ns = _ns()
    raw = "Ask my team to complete the outreach training by 12"
    parsed = {
        "title": raw,
        "description": raw,
        "action_items": [],
        "assignee_hints": ["my team"],
    }
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Henrik")
    title = (parsed.get("title") or "").lower()
    desc = (parsed.get("description") or "").lower()
    assert "outreach" in title
    assert not title.startswith("ask")
    assert "ask my team" not in desc
    assert "please ask" not in desc
    assert "please" in desc
    assert "complete" in desc


def test_system_prompt_forbids_pasting_the_command():
    assert "NEVER paste the user's raw prompt" in SRC
    assert "Tell my team that on Monday we need to finish outreach training" in SRC
    assert 'title: "Finish outreach training"' in SRC


def test_need_my_group_to_submit_is_a_clear_ask():
    ns = _ns()
    raw = (
        "I need my @HM Org to submit one BAMFAM call by end of day "
        "meaning by 3 PM PST to their managers"
    )
    parsed = {
        "title": raw,
        "description": raw,
        "action_items": [],
        "assignee_hints": ["HM Org", "managers"],
    }
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Henrik")
    title = (parsed.get("title") or "").lower()
    desc = (parsed.get("description") or "").lower()
    assert "submit" in title and "bamfam" in title
    assert "to their" not in title
    assert "i need my" not in desc
    assert "please i" not in desc
    assert "please submit" in desc
    assert "your managers" in desc
    assert "complete the conversation" not in desc
    dropped = ns["_drop_destination_assignee_hints"](["HM Org", "managers", "Hm Managers"], raw)
    assert "HM Org" in dropped
    assert not any(str(h).lower() in ("managers", "hm managers") for h in dropped)
    voice = ns["_strip_manager_voice"](ns["_strip_people_noise"](raw, ["HM Org"]))
    assert voice.lower().startswith("submit")
    assert "i need my" not in voice.lower()

    src = (ROOT / "frontend" / "src" / "components" / "AIQuickCreate.js").read_text(encoding="utf-8")
    assert 'data-testid="ai-confirm-assignee-ask"' in src
    assert "layoutTaskDescription(editDesc)" in src


def test_preview_panel_is_opaque():
    css = (ROOT / "frontend" / "src" / "index.css").read_text(encoding="utf-8")
    block = css.split(".ai-dock-panel.is-active")[1].split("[data-theme")[0]
    assert "background: rgba(255, 255, 255, 0.9)" not in block
    assert "background: #fff" in block


def test_name_needs_to_becomes_direct_please_ask():
    ns = _ns()
    raw = "Today Benjamin needs to review and clear all redundant open opportunities"
    parsed = {
        "title": "Review and clear all redundant open opportunities",
        "description": raw,
        "action_items": [],
        "assignee_hints": ["Benjamin"],
    }
    ns["_enrich_parse_title_description"](parsed, raw, manager_name="Henrik")
    desc = (parsed.get("description") or "").lower()
    assert "benjamin" not in desc.split("next steps:")[0]
    assert "please needs to" not in desc
    assert "needs to review" not in desc.split("next steps:")[0]
    assert "today" in desc
    assert "please review" in desc
    assert "redundant open opportunities" in desc

    # Even if the name is still in the work text, rewrite to an imperative ask.
    ask = ns["_assignee_facing_ask"](
        "Today",
        "Benjamin needs to review and clear all redundant open opportunities",
        "Henrik",
    ).lower()
    assert "benjamin" not in ask
    assert "please needs to" not in ask
    assert ask.startswith("today, please review")

    leftover = ns["_strip_manager_voice"]("needs to review and clear all redundant open opportunities")
    assert leftover.lower().startswith("review")
