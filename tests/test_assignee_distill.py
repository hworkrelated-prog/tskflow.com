"""Distill manager commands into assignee-facing task copy."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "backend" / "server.py").read_text(encoding="utf-8")


def _ns():
    start = SRC.index("_SPEECH_VERB_STOP = ")
    end = SRC.index("async def _llm_vet_title")
    ns = {}
    exec("import re\nfrom typing import Optional, List\n" + SRC[start:end], ns)
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


def test_confirm_shows_assignee_ask():
    src = (ROOT / "frontend" / "src" / "components" / "AIQuickCreate.js").read_text(encoding="utf-8")
    assert 'data-testid="ai-confirm-assignee-ask"' in src
    assert "{editDesc}" in src


def test_preview_panel_is_opaque():
    css = (ROOT / "frontend" / "src" / "index.css").read_text(encoding="utf-8")
    block = css.split(".ai-dock-panel.is-active")[1].split("[data-theme")[0]
    assert "background: rgba(255, 255, 255, 0.9)" not in block
    assert "background: #fff" in block
